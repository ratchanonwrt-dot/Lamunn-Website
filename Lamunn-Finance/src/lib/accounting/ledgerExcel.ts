import ExcelJS from "exceljs";
import { prisma, type AccountType } from "@lamunn/db-finance";
import { toSatang } from "./money";
import { naturalAmount } from "./reports";
import { formatPartnerDisplayName } from "./partnerDisplay";

export interface LedgerExportLine {
  date: Date;
  entryNo: string;
  description: string;
  memo: string | null;
  branchName: string | null;
  partnerName: string | null;
  debit: number;
  credit: number;
  running: number;
}

export interface LedgerExportAccount {
  id: string;
  code: string;
  nameTh: string;
  type: AccountType;
  opening: number;
  totalDebit: number;
  totalCredit: number;
  closing: number;
  lines: LedgerExportLine[];
}

export async function loadLedgerExportData({
  start,
  end,
  accountId,
}: {
  start: Date;
  end: Date;
  accountId?: string;
}): Promise<LedgerExportAccount[]> {
  const accounts = await prisma.accAccount.findMany({
    where: accountId ? { id: accountId } : { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, nameTh: true, type: true },
  });
  if (accounts.length === 0) return [];

  const accountIds = accounts.map((account) => account.id);
  const [openingRows, periodLines] = await Promise.all([
    prisma.accJournalLine.groupBy({
      by: ["accountId"],
      where: { accountId: { in: accountIds }, status: "POSTED", date: { lt: start } },
      _sum: { debit: true, credit: true },
    }),
    prisma.accJournalLine.findMany({
      where: { accountId: { in: accountIds }, status: "POSTED", date: { gte: start, lte: end } },
      orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
      select: {
        accountId: true,
        date: true,
        debit: true,
        credit: true,
        memo: true,
        entry: { select: { entryNo: true, description: true } },
        branch: { select: { name: true } },
        partner: { select: { name: true, branchTag: true } },
      },
    }),
  ]);

  const openingByAccount = new Map(
    openingRows.map((row) => [row.accountId, toSatang(row._sum.debit) - toSatang(row._sum.credit)])
  );
  const linesByAccount = new Map<string, typeof periodLines>();
  for (const line of periodLines) {
    const current = linesByAccount.get(line.accountId) ?? [];
    current.push(line);
    linesByAccount.set(line.accountId, current);
  }

  return accounts.map((account) => {
    const opening = openingByAccount.get(account.id) ?? 0;
    let running = opening;
    let totalDebit = 0;
    let totalCredit = 0;
    const lines = (linesByAccount.get(account.id) ?? []).map((line) => {
      const debit = toSatang(line.debit);
      const credit = toSatang(line.credit);
      totalDebit += debit;
      totalCredit += credit;
      running += debit - credit;
      return {
        date: line.date,
        entryNo: line.entry.entryNo,
        description: line.entry.description,
        memo: line.memo,
        branchName: line.branch?.name ?? null,
        partnerName: line.partner ? formatPartnerDisplayName(line.partner.name, line.partner.branchTag) : null,
        debit,
        credit,
        running,
      };
    });
    return { ...account, opening, totalDebit, totalCredit, closing: running, lines };
  });
}

const HEADERS = ["วันที่", "เลขที่ใบสำคัญ", "รายการ", "สาขา/คู่ค้า", "เดบิต", "เครดิต", "ยอดคงเหลือ"];

export function buildLedgerWorkbook(
  accounts: LedgerExportAccount[],
  { companyName, year, month }: { companyName: string; year: number; month: number }
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("บัญชีแยกประเภท");
  sheet.columns = [
    { width: 14 },
    { width: 18 },
    { width: 42 },
    { width: 28 },
    { width: 16 },
    { width: 16 },
    { width: 18 },
  ];

  sheet.mergeCells(1, 1, 1, HEADERS.length);
  sheet.getCell(1, 1).value = companyName;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  sheet.getCell(1, 1).alignment = { horizontal: "center" };
  sheet.mergeCells(2, 1, 2, HEADERS.length);
  sheet.getCell(2, 1).value = `บัญชีแยกประเภท ประจำเดือน ${String(month).padStart(2, "0")}/${year}`;
  sheet.getCell(2, 1).font = { bold: true };
  sheet.getCell(2, 1).alignment = { horizontal: "center" };

  let rowNo = 4;
  for (const account of accounts) {
    sheet.mergeCells(rowNo, 1, rowNo, HEADERS.length);
    const titleCell = sheet.getCell(rowNo, 1);
    titleCell.value = `${account.code} ${account.nameTh}`;
    titleCell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
    rowNo++;

    const headerRow = sheet.getRow(rowNo);
    HEADERS.forEach((header, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = header;
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
      cell.alignment = { horizontal: "center" };
    });
    rowNo++;

    const openingRow = sheet.getRow(rowNo++);
    openingRow.getCell(3).value = "ยอดยกมา";
    openingRow.getCell(7).value = naturalAmount(account.type, account.opening) / 100;
    openingRow.getCell(7).numFmt = "#,##0.00";

    for (const line of account.lines) {
      const row = sheet.getRow(rowNo++);
      row.getCell(1).value = line.date;
      row.getCell(1).numFmt = "dd/mm/yyyy";
      row.getCell(2).value = line.entryNo;
      row.getCell(3).value = [line.description, line.memo].filter(Boolean).join(" — ");
      row.getCell(4).value = [line.branchName, line.partnerName].filter(Boolean).join(" / ");
      row.getCell(5).value = line.debit / 100;
      row.getCell(6).value = line.credit / 100;
      row.getCell(7).value = naturalAmount(account.type, line.running) / 100;
      [5, 6, 7].forEach((column) => (row.getCell(column).numFmt = "#,##0.00"));
    }

    const totalRow = sheet.getRow(rowNo++);
    totalRow.getCell(3).value = "รวม / ยอดยกไป";
    totalRow.getCell(3).font = { bold: true };
    totalRow.getCell(5).value = account.totalDebit / 100;
    totalRow.getCell(6).value = account.totalCredit / 100;
    totalRow.getCell(7).value = naturalAmount(account.type, account.closing) / 100;
    [5, 6, 7].forEach((column) => {
      totalRow.getCell(column).numFmt = "#,##0.00";
      totalRow.getCell(column).font = { bold: true };
      totalRow.getCell(column).border = { top: { style: "thin" }, bottom: { style: "double" } };
    });
    rowNo += 2;
  }

  sheet.views = [{ state: "frozen", ySplit: 2 }];
  return workbook;
}

export function ledgerExcelFilename(year: number, month: number, accountCode?: string) {
  const scope = accountCode ? `-${accountCode.replace(/[^A-Za-z0-9_-]/g, "-")}` : "-all";
  return `general-ledger${scope}-${year}-${String(month).padStart(2, "0")}.xlsx`;
}
