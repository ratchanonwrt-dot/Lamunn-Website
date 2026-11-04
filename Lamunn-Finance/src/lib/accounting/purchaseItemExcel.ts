import ExcelJS from "exceljs";
import { PURCHASE_ITEM_CATEGORY_LABELS, type PurchaseItemReport } from "./purchaseItemReport";
import { formatPartnerDisplayName } from "./partnerDisplay";

interface PurchaseItemExcelOptions {
  companyName: string;
  year: number;
  month: number;
}

const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const HEADERS = ["ลำดับ", "วันที่", "ซัพพลายเออร์", "หมวด", "รายการ", "จำนวน", "ราคาต่อหน่วย"];
const formatDate = (date: Date) => `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;

export function buildPurchaseItemWorkbook(report: PurchaseItemReport, options: PurchaseItemExcelOptions): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("PurchaseItems");
  [8, 14, 34, 20, 42, 12, 18].forEach((width, index) => (sheet.getColumn(index + 1).width = width));

  sheet.mergeCells(1, 1, 1, HEADERS.length);
  sheet.getCell(1, 1).value = options.companyName || "ชื่อบริษัท";
  sheet.mergeCells(2, 1, 2, HEADERS.length);
  sheet.getCell(2, 1).value = "รายงานวัตถุดิบ / บรรจุภัณฑ์ / อื่น ๆ";
  sheet.mergeCells(3, 1, 3, HEADERS.length);
  sheet.getCell(3, 1).value = `ประจำเดือน ${THAI_MONTHS[options.month - 1]} ${options.year}`;
  [1, 2, 3].forEach((rowNumber) => {
    const cell = sheet.getCell(rowNumber, 1);
    cell.font = { bold: true, size: rowNumber === 2 ? 14 : 11 };
    cell.alignment = { horizontal: "center" };
  });

  const headerRow = sheet.getRow(5);
  HEADERS.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF047857" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
  });

  report.rows.forEach((item, index) => {
    const row = sheet.getRow(index + 6);
    row.values = [
      index + 1,
      formatDate(item.invoiceDate),
      formatPartnerDisplayName(item.vendorName, item.vendorBranchTag),
      PURCHASE_ITEM_CATEGORY_LABELS[item.category],
      item.description,
      Number(item.quantity),
      item.unitPriceSatang / 100,
    ];
    row.getCell(6).numFmt = "#,##0.####";
    row.getCell(7).numFmt = "#,##0.00";
    row.alignment = { vertical: "top", wrapText: true };
  });

  sheet.views = [{ state: "frozen", ySplit: 5 }];
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, report.rows.length + 5), column: HEADERS.length } };
  return workbook;
}

export function purchaseItemExcelFilename(year: number, month: number): string {
  return `purchase-items-${year}-${String(month).padStart(2, "0")}.xlsx`;
}
