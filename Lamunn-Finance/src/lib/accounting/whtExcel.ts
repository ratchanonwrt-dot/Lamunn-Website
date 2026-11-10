import ExcelJS from "exceljs";
import type { AccWhtFormType } from "@lamunn/db-finance";
import type { WhtReport } from "./taxReports";
import { formatAccountingDate } from "./dateFormat";
import { WHT_FORM_SHORT } from "./whtTypes";

export interface WhtExcelOptions {
  companyName: string;
  companyTaxId: string;
  companyAddress: string;
  formType: AccWhtFormType;
  year: number;
  month: number;
}

const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const HEADERS = ["ลำดับ", "วันที่จ่าย", "เลขที่หนังสือรับรอง", "ผู้รับเงิน", "เลขผู้เสียภาษี", "ประเภทเงินได้", "จำนวนเงินที่จ่าย", "อัตรา", "ภาษีที่หัก"];
const WIDTHS = [8, 14, 22, 42, 18, 32, 18, 12, 18];

/** Excel ใช้ข้อมูลชุดเดียวกับหน้ารายงาน เพื่อไม่ให้ยอดที่ดาวน์โหลดต่างจากยอดที่ผู้ทำบัญชีตรวจบนจอ */
export function buildWhtWorkbook(report: WhtReport, opts: WhtExcelOptions): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(opts.formType);
  WIDTHS.forEach((width, index) => (ws.getColumn(index + 1).width = width));

  const heading = [
    opts.companyName,
    `${WHT_FORM_SHORT[opts.formType]} — ภาษีเงินได้หัก ณ ที่จ่าย`,
    `สำหรับเดือน ${THAI_MONTHS[opts.month - 1]} ${opts.year + 543}`,
    `เลขประจำตัวผู้เสียภาษี ${opts.companyTaxId || "-"}`,
    opts.companyAddress,
  ];
  heading.forEach((value, index) => {
    ws.mergeCells(index + 1, 1, index + 1, HEADERS.length);
    const cell = ws.getCell(index + 1, 1);
    cell.value = value;
    cell.font = { bold: index < 3, size: index === 0 ? 14 : 11 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  const headerRow = ws.getRow(7);
  HEADERS.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });

  const firstDataRow = 8;
  report.rows.forEach((row, index) => {
    const excelRow = ws.getRow(firstDataRow + index);
    excelRow.values = [
      index + 1,
      formatAccountingDate(row.payDate),
      row.docNo,
      row.payeeName,
      row.payeeTaxId ?? "",
      row.incomeType,
      row.base / 100,
      row.rate,
      row.wht / 100,
    ];
    excelRow.getCell(7).numFmt = "#,##0.00";
    excelRow.getCell(8).numFmt = "0.00%";
    excelRow.getCell(9).numFmt = "#,##0.00";
    excelRow.getCell(1).alignment = { horizontal: "center" };
    excelRow.getCell(2).alignment = { horizontal: "center" };
  });

  const lastDataRow = firstDataRow + Math.max(report.rows.length, 1) - 1;
  const totalRow = ws.getRow(lastDataRow + 1);
  totalRow.getCell(6).value = `รวม ${report.rows.length} รายการ · ผู้รับเงิน ${report.payeeCount} ราย`;
  totalRow.getCell(6).font = { bold: true };
  totalRow.getCell(7).value = { formula: `SUM(G${firstDataRow}:G${lastDataRow})`, result: report.totalBase / 100 };
  totalRow.getCell(9).value = { formula: `SUM(I${firstDataRow}:I${lastDataRow})`, result: report.totalWht / 100 };
  [7, 9].forEach((column) => {
    totalRow.getCell(column).numFmt = "#,##0.00";
    totalRow.getCell(column).font = { bold: true };
    totalRow.getCell(column).border = { top: { style: "thin" }, bottom: { style: "double" } };
  });

  ws.views = [{ state: "frozen", ySplit: 7 }];
  ws.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return wb;
}

export function whtExcelFilename(formType: AccWhtFormType, year: number, month: number) {
  return `${formType.toLowerCase()}-report-${year}-${String(month).padStart(2, "0")}.xlsx`;
}
