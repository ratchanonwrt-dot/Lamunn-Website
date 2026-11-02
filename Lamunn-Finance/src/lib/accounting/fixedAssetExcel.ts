import ExcelJS from "exceljs";
import { FIXED_ASSET_CATEGORY_LABELS } from "./fixedAssets";
import { toBaht } from "./money";

type ExportAsset = {
  code: string;
  name: string;
  category: keyof typeof FIXED_ASSET_CATEGORY_LABELS;
  branchName: string | null;
  purchaseDate: Date;
  availableDate: Date;
  quantity: number;
  costSatang: number;
  usefulLifeMonths: number;
  accumulatedSatang: number;
  bookValueSatang: number;
  invoiceNo: string | null;
  status: "ACTIVE" | "DISPOSED";
  monthDepreciationSatang?: number;
};

function header(sheet: ExcelJS.Worksheet, companyName: string, title: string, columns: number) {
  sheet.mergeCells(1, 1, 1, columns);
  sheet.getCell(1, 1).value = companyName || "ชื่อบริษัท";
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  sheet.getCell(1, 1).alignment = { horizontal: "center" };
  sheet.mergeCells(2, 1, 2, columns);
  sheet.getCell(2, 1).value = title;
  sheet.getCell(2, 1).font = { bold: true };
  sheet.getCell(2, 1).alignment = { horizontal: "center" };
}

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
}

export function buildFixedAssetWorkbook(assets: ExportAsset[], options: { companyName: string; year: number; month: number }) {
  const workbook = new ExcelJS.Workbook();
  const register = workbook.addWorksheet("ทะเบียนทรัพย์สิน");
  register.columns = [14, 28, 26, 20, 14, 14, 10, 16, 14, 18, 18, 18, 14].map((width) => ({ width }));
  header(register, options.companyName, `ทะเบียนทรัพย์สิน ณ ${String(options.month).padStart(2, "0")}/${options.year}`, 13);
  const registerHeaders = ["รหัส", "รายการ", "หมวด", "สาขา", "วันที่ซื้อ", "วันที่พร้อมใช้", "จำนวน", "ราคาทุน", "อายุ (เดือน)", "ค่าเสื่อมสะสม", "มูลค่าคงเหลือ", "เลขที่ใบกำกับ", "สถานะ"];
  registerHeaders.forEach((value, index) => (register.getRow(4).getCell(index + 1).value = value));
  styleHeader(register.getRow(4));
  assets.forEach((asset, index) => {
    const row = register.getRow(index + 5);
    row.values = [asset.code, asset.name, FIXED_ASSET_CATEGORY_LABELS[asset.category], asset.branchName ?? "", asset.purchaseDate, asset.availableDate, asset.quantity, toBaht(asset.costSatang), asset.usefulLifeMonths, toBaht(asset.accumulatedSatang), toBaht(asset.bookValueSatang), asset.invoiceNo ?? "", asset.status === "ACTIVE" ? "ใช้งาน" : "ขายแล้ว"];
    [5, 6].forEach((column) => (row.getCell(column).numFmt = "dd/mm/yyyy"));
    [8, 10, 11].forEach((column) => (row.getCell(column).numFmt = "#,##0.00"));
  });

  const depreciation = workbook.addWorksheet("ค่าเสื่อมราคา");
  depreciation.columns = [14, 30, 26, 18, 18, 18, 18].map((width) => ({ width }));
  header(depreciation, options.companyName, `ทะเบียนค่าเสื่อมราคา ประจำเดือน ${String(options.month).padStart(2, "0")}/${options.year}`, 7);
  ["รหัส", "รายการ", "หมวด", "ราคาทุน", "ค่าเสื่อมเดือนนี้", "ค่าเสื่อมสะสม", "มูลค่าคงเหลือ"].forEach((value, index) => (depreciation.getRow(4).getCell(index + 1).value = value));
  styleHeader(depreciation.getRow(4));
  assets.forEach((asset, index) => {
    const row = depreciation.getRow(index + 5);
    row.values = [asset.code, asset.name, FIXED_ASSET_CATEGORY_LABELS[asset.category], toBaht(asset.costSatang), toBaht(asset.monthDepreciationSatang ?? 0), toBaht(asset.accumulatedSatang), toBaht(asset.bookValueSatang)];
    [4, 5, 6, 7].forEach((column) => (row.getCell(column).numFmt = "#,##0.00"));
  });
  workbook.eachSheet((sheet) => { sheet.views = [{ state: "frozen", ySplit: 4 }]; sheet.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 }; });
  return workbook;
}
