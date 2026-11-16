import ExcelJS from "exceljs";
import { toBaht } from "./money";
import {
  summarizeReconciliationRows,
  type ReconciliationResultRow,
} from "./bankReconciliation";
import {
  PLATFORM_LABELS,
  summarizePlatformReconciliation,
  type PlatformCode,
  type PlatformReconciliationResult,
} from "./platformBankReconciliation";

const MONEY_FORMAT = "#,##0.00;[Red]-#,##0.00";

function styleTitle(sheet: ExcelJS.Worksheet, title: string, subtitle: string, columnCount: number) {
  sheet.mergeCells(1, 1, 1, columnCount);
  sheet.getCell(1, 1).value = title;
  sheet.getCell(1, 1).font = { bold: true, size: 15 };
  sheet.getCell(1, 1).alignment = { horizontal: "center" };
  sheet.mergeCells(2, 1, 2, columnCount);
  sheet.getCell(2, 1).value = subtitle;
  sheet.getCell(2, 1).alignment = { horizontal: "center" };
}

function styleHeader(row: ExcelJS.Row) {
  row.height = 28;
  row.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FF94A3B8" } } };
  });
}

function bankStatusLabel(row: ReconciliationResultRow): string {
  if (row.status === "not-found") return "ไม่พบคู่";
  if (row.status === "mismatched") return row.matchKind === "amount-mismatch" ? "ยอดไม่ตรงกัน" : "รายละเอียดไม่ตรงกัน";
  return row.daysApart ? `ตรงกัน (วันที่ต่าง ${row.daysApart} วัน)` : "ตรงกัน";
}

function platformStatusLabel(row: PlatformReconciliationResult): string {
  if (row.status === "not-found") return "ไม่พบเงินเข้าธนาคาร";
  if (row.status === "mismatched") return "ยอดไม่ตรงกัน";
  const parts = ["ตรงกัน"];
  if (row.daysApart) parts.push(`เข้าหลัง ${row.daysApart} วัน`);
  if (row.inferredTransferFee) parts.push("หักค่าธรรมเนียมโอน 5 บาท");
  return parts.join(" · ");
}

export function buildBankReconciliationWorkbook(
  rows: ReconciliationResultRow[],
  options: { accountCode: string; year: number; month: number; statusLabel: string },
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("ผลการกระทบยอด");
  sheet.columns = [14, 38, 14, 18, 38, 14, 18, 20, 22, 18].map((width) => ({ width }));
  styleTitle(
    sheet,
    "ผลการกระทบยอดเงินฝากธนาคาร",
    `บัญชี ${options.accountCode} · เดือน ${options.month}/${options.year + 543} · สถานะ ${options.statusLabel}`,
    10,
  );

  const headers = ["วันที่", "รายการธนาคาร", "เดบิต/เครดิต", "ยอดธนาคาร", "รายการบัญชี", "เดบิต/เครดิต", "ยอดบัญชี", "คำที่ตรงกัน", "สถานะ", "ผลต่าง"];
  headers.forEach((value, index) => (sheet.getRow(4).getCell(index + 1).value = value));
  styleHeader(sheet.getRow(4));

  rows.forEach((row, index) => {
    const excelRow = sheet.getRow(index + 5);
    excelRow.values = [
      row.dateLabel,
      row.bank?.detail ?? "",
      row.bank ? (row.bank.amount > 0 ? "เดบิต" : "เครดิต") : "",
      row.bank ? toBaht(Math.abs(row.bank.amount)) : null,
      row.ledger?.detail ?? "",
      row.ledger ? (row.ledger.amount > 0 ? "เดบิต" : "เครดิต") : "",
      row.ledger ? toBaht(Math.abs(row.ledger.amount)) : null,
      row.commonWords.join(", "),
      bankStatusLabel(row),
      toBaht(row.amountDifference),
    ];
    [4, 7, 10].forEach((column) => (excelRow.getCell(column).numFmt = MONEY_FORMAT));
  });

  const summary = summarizeReconciliationRows(rows);
  const summaryStart = rows.length + 7;
  sheet.getCell(summaryStart, 1).value = "สรุปผลต่าง";
  sheet.getCell(summaryStart, 1).font = { bold: true, size: 12 };
  const summaryRows: Array<[string, number, number, number]> = [
    ["เงินเข้า", summary.bankIn, summary.ledgerIn, summary.inDifference],
    ["เงินออก", summary.bankOut, summary.ledgerOut, summary.outDifference],
    ["สุทธิ", summary.bankNet, summary.ledgerNet, summary.netDifference],
  ];
  ["รายการ", "ธนาคาร", "บัญชี", "ผลต่าง"].forEach((value, index) => (sheet.getRow(summaryStart + 1).getCell(index + 1).value = value));
  styleHeader(sheet.getRow(summaryStart + 1));
  summaryRows.forEach(([label, bank, ledger, difference], index) => {
    const row = sheet.getRow(summaryStart + 2 + index);
    row.values = [label, toBaht(bank), toBaht(ledger), toBaht(difference)];
    [2, 3, 4].forEach((column) => (row.getCell(column).numFmt = MONEY_FORMAT));
  });

  sheet.views = [{ state: "frozen", ySplit: 4 }];
  sheet.autoFilter = { from: "A4", to: "J4" };
  sheet.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return workbook;
}

export function buildPlatformReconciliationWorkbook(
  rows: PlatformReconciliationResult[],
  options: { platform: PlatformCode; statusLabel: string },
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("ผลกระทบยอดแพลตฟอร์ม");
  sheet.columns = [16, 42, 24, 20, 18, 16, 38, 20, 18, 28].map((width) => ({ width }));
  styleTitle(
    sheet,
    `ผลการกระทบยอด ${PLATFORM_LABELS[options.platform]}`,
    `เทียบยอดรับสุทธิจากแพลตฟอร์มกับเงินเข้าธนาคาร · สถานะ ${options.statusLabel}`,
    10,
  );

  const headers = ["วันที่แพลตฟอร์ม", "สาขา / หมายเลขร้าน", "เลขอ้างอิง", "ยอดโอนจากรายงาน", "ค่าธรรมเนียมโอน", "วันที่ธนาคาร", "รายการธนาคาร", "เงินเข้าธนาคาร", "ผลต่าง", "สถานะ"];
  headers.forEach((value, index) => (sheet.getRow(4).getCell(index + 1).value = value));
  styleHeader(sheet.getRow(4));

  rows.forEach((row, index) => {
    const excelRow = sheet.getRow(index + 5);
    excelRow.values = [
      row.payouts[0]?.dateLabel ?? row.dateLabel,
      row.payouts.map((payout) => [payout.storeName, payout.storeId].filter(Boolean).join(" / ")).join("\n"),
      row.payouts.map((payout) => payout.reference).filter(Boolean).join("\n"),
      toBaht(row.platformTotal),
      toBaht(row.inferredTransferFee),
      row.bank?.dateLabel ?? "",
      row.bank?.detail ?? "",
      row.bank ? toBaht(row.bank.amount) : null,
      toBaht(row.amountDifference),
      platformStatusLabel(row),
    ];
    [4, 5, 8, 9].forEach((column) => (excelRow.getCell(column).numFmt = MONEY_FORMAT));
    excelRow.alignment = { vertical: "top", wrapText: true };
  });

  const summary = summarizePlatformReconciliation(rows);
  const summaryStart = rows.length + 7;
  sheet.getCell(summaryStart, 1).value = "สรุปผลต่างยอดรับจากแพลตฟอร์ม";
  sheet.getCell(summaryStart, 1).font = { bold: true, size: 12 };
  const summaryRows: Array<[string, number]> = [
    ["ยอดโอนตามแพลตฟอร์ม", summary.platformTotal],
    ["ค่าธรรมเนียมโอน", summary.transferFeeTotal],
    ["ยอดที่ควรเข้าธนาคาร", summary.bankExpectedTotal],
    ["ยอดเข้าธนาคารที่จับคู่", summary.bankTotal],
    ["ผลต่าง", summary.difference],
  ];
  summaryRows.forEach(([label, amount], index) => {
    const row = sheet.getRow(summaryStart + 1 + index);
    row.values = [label, toBaht(amount)];
    row.getCell(2).numFmt = MONEY_FORMAT;
    if (label === "ผลต่าง") row.font = { bold: true };
  });

  sheet.views = [{ state: "frozen", ySplit: 4 }];
  sheet.autoFilter = { from: "A4", to: "J4" };
  sheet.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return workbook;
}
