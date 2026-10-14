import ExcelJS from "exceljs";
import type { InputVatReport } from "./taxReports";

/** สร้างไฟล์ Excel รายงานภาษีซื้อ ตามแบบฟอร์มที่ฝ่ายบัญชีใช้ยื่น (ไฟล์ตัวอย่าง "รายงานภาษีซื้อ.xlsx")
 *
 * โครง: 4 บรรทัดหัว (ชื่อรายงาน / งวด / ผู้ประกอบการ+เลขผู้เสียภาษี / ที่อยู่) เว้น 1 บรรทัด
 * แล้วหัวตาราง 8 คอลัมน์ที่บรรทัด 6 ข้อมูลเริ่มบรรทัด 7 ปิดท้ายด้วยแถวรวมที่ใช้สูตร SUM
 * (ใช้สูตรจริงไม่ใช่ตัวเลขนิ่ง — บัญชีชอบแก้/ลบแถวในไฟล์แล้วให้ยอดรวมขยับตาม)
 * ยอดเงินเก็บเป็นตัวเลขบาท ไม่ใช่ข้อความ เพื่อให้ Excel บวกต่อได้ */
export interface InputVatExcelOptions {
  companyName: string;
  companyTaxId: string;
  companyAddress: string;
  year: number; // ค.ศ.
  month: number; // 1-12
}

const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

const HEADERS = ["ลำดับที่", "วัน/เดือน/ปี", "เลขที่ใบกำกับ", "ชื่อผู้จำหน่าย", "เลขผู้เสียภาษี", "สำนักงานใหญ่/สาขา", "มูลค่า", "ภาษีมูลค่าเพิ่ม"];
const WIDTHS = [8.9, 13.1, 23.3, 58.7, 17.6, 18.6, 13.9, 27.0];

const fmtDate = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

export function buildInputVatWorkbook(report: InputVatReport, opts: InputVatExcelOptions): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("PurchaseTaxReport");
  WIDTHS.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const headLines = [
    "รายงานภาษีซื้อตามเอกสาร",
    `สำหรับงวดภาษี เดือน ${THAI_MONTHS[opts.month - 1]} ปี ${opts.year}`,
    `ชื่อผู้ประกอบการ ${opts.companyName} เลขประจำตัวผู้เสียภาษีอากร ${opts.companyTaxId}`,
    opts.companyAddress,
  ];
  headLines.forEach((text, i) => {
    const row = i + 1;
    ws.mergeCells(row, 1, row, HEADERS.length);
    const cell = ws.getCell(row, 1);
    cell.value = text;
    cell.font = { bold: true, size: 11 };
    cell.alignment = { horizontal: "center" };
  });

  const headerRow = ws.getRow(6);
  HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });

  const firstDataRow = 7;
  report.rows.forEach((r, i) => {
    const row = ws.getRow(firstDataRow + i);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = fmtDate(r.date);
    row.getCell(3).value = r.invoiceNo; // ใช้เลขจากเอกสารหรือบรรทัด AI เท่านั้น ห้ามเอาเลขที่ใบสำคัญมาแทน
    row.getCell(4).value = r.vendorName;
    row.getCell(5).value = r.taxId ?? "";
    row.getCell(6).value = r.branchTag ?? "";
    row.getCell(7).value = r.base / 100;
    row.getCell(8).value = r.vat / 100;
    row.getCell(7).numFmt = "#,##0.00";
    row.getCell(8).numFmt = "#,##0.00";
    row.getCell(1).alignment = { horizontal: "center" };
    row.getCell(2).alignment = { horizontal: "center" };
  });

  const lastDataRow = firstDataRow + Math.max(report.rows.length, 1) - 1;
  const totalRow = ws.getRow(lastDataRow + 1);
  totalRow.getCell(6).value = "ยอดรวมทั้งหมด";
  totalRow.getCell(6).font = { bold: true };
  totalRow.getCell(7).value = { formula: `SUM(G${firstDataRow}:G${lastDataRow})`, result: report.totalBase / 100 };
  totalRow.getCell(8).value = { formula: `SUM(H${firstDataRow}:H${lastDataRow})`, result: report.totalVat / 100 };
  [7, 8].forEach((c) => {
    totalRow.getCell(c).numFmt = "#,##0.00";
    totalRow.getCell(c).font = { bold: true };
    totalRow.getCell(c).border = { top: { style: "thin" }, bottom: { style: "double" } };
  });

  return wb;
}

/** ชื่อไฟล์แบบ purchase-tax-report-2026-09.xlsx — เรียงตามเดือนได้เมื่อวางรวมกันในโฟลเดอร์ */
export const inputVatExcelFilename = (year: number, month: number) => `purchase-tax-report-${year}-${String(month).padStart(2, "0")}.xlsx`;
