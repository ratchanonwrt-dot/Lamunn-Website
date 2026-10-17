import { fmtSatang } from "./money";

export type ReconciliationSource = "bank" | "ledger";
export type ReconciliationDirection = "in" | "out" | "both";
export type ReconciliationStatusFilter = "all" | ReconciliationResultRow["status"];
export const BANK_RECONCILIATION_ACCOUNT_CODE = "11122.01";

export type ReconciliationItem = {
  rowNumber: number;
  dateKey: string;
  dateLabel: string;
  detail: string;
  amount: number;
};

export type ReconciliationResultRow = {
  id: string;
  dateKey: string;
  dateLabel: string;
  bank: ReconciliationItem | null;
  ledger: ReconciliationItem | null;
  status: "matched" | "mismatched" | "not-found";
  matched: boolean;
  matchKind: "same-date" | "near-date" | "amount-mismatch" | "detail-mismatch" | null;
  daysApart: number | null;
  commonWords: string[];
  amountDifference: number;
};

export type ReconciliationSummary = {
  matchedCount: number;
  mismatchedCount: number;
  notFoundCount: number;
  bankIn: number;
  ledgerIn: number;
  inDifference: number;
  bankOut: number;
  ledgerOut: number;
  outDifference: number;
  bankNet: number;
  ledgerNet: number;
  netDifference: number;
};

export function filterReconciliationRows(
  rows: ReconciliationResultRow[],
  status: ReconciliationStatusFilter,
): ReconciliationResultRow[] {
  return status === "all" ? rows : rows.filter((row) => row.status === status);
}

type ColumnMap = {
  date: number;
  details: number[];
  amount?: number;
  debit?: number;
  credit?: number;
  deposit?: number;
  withdrawal?: number;
};

const DATE_HEADERS = ["date", "transactiondate", "postingdate", "วันที่", "วันเดือนปี"];
const DETAIL_HEADERS = [
  "description", "detail", "details", "particular", "particulars", "memo", "partner", "vendor", "customer",
  "รายการ", "รายละเอียด", "คำอธิบาย", "คู่ค้า", "สาขาคู่ค้า",
];
const AMOUNT_HEADERS = ["amount", "transactionamount", "ยอดรายการ", "จำนวนเงิน", "ยอดเงิน"];
const DEBIT_HEADERS = ["debit", "dr", "เดบิต"];
const CREDIT_HEADERS = ["credit", "cr", "เครดิต"];
const DEPOSIT_HEADERS = ["deposit", "moneyin", "income", "ฝาก", "เงินเข้า", "รับ"];
const WITHDRAWAL_HEADERS = ["withdrawal", "withdraw", "moneyout", "payment", "ถอน", "เงินออก", "จ่าย"];

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_./()\-]+/g, "");
}

function headerMatches(header: string, aliases: string[]): boolean {
  return aliases.includes(header) || aliases.some((alias) => alias.length >= 4 && header.includes(alias));
}

function findColumn(headers: string[], aliases: string[]): number | undefined {
  const exactIndex = headers.findIndex((header) => aliases.includes(header));
  if (exactIndex >= 0) return exactIndex;
  // คำย่ออย่าง CR/DR ห้ามค้นแบบบางส่วน เพราะจะไปชนกับ Description หรือหัวคอลัมน์อื่น
  const index = headers.findIndex((header) => aliases.some((alias) => alias.length >= 4 && header.includes(alias)));
  return index >= 0 ? index : undefined;
}

function findColumns(headers: string[], aliases: string[]): number[] {
  return headers.flatMap((header, index) => headerMatches(header, aliases) ? [index] : []);
}

function detectColumns(row: unknown[]): ColumnMap | null {
  // ExcelJS คืนแถวที่มีเซลล์ว่างเป็น sparse array จึงต้องเติมช่องว่างก่อนเรียก string methods
  const headers = Array.from({ length: row.length }, (_, index) => normalizeHeader(row[index]));
  const date = findColumn(headers, DATE_HEADERS);
  if (date === undefined) return null;

  const map: ColumnMap = {
    date,
    details: findColumns(headers, DETAIL_HEADERS),
    amount: findColumn(headers, AMOUNT_HEADERS),
    debit: findColumn(headers, DEBIT_HEADERS),
    credit: findColumn(headers, CREDIT_HEADERS),
    deposit: findColumn(headers, DEPOSIT_HEADERS),
    withdrawal: findColumn(headers, WITHDRAWAL_HEADERS),
  };

  return map.amount !== undefined
    || map.debit !== undefined
    || map.credit !== undefined
    || map.deposit !== undefined
    || map.withdrawal !== undefined
    ? map
    : null;
}

function parseMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) : null;

  const original = String(value).trim();
  if (!original || original === "-") return null;
  const negative = /^\(.*\)$/.test(original) || /(?:dr|เดบิต)$/i.test(original);
  const cleaned = original.replace(/[(),฿,\s]/g, "").replace(/(?:cr|dr|เครดิต|เดบิต)$/i, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(Math.abs(parsed) * 100) * (negative || parsed < 0 ? -1 : 1);
}

function dateParts(value: unknown): { year: number; month: number; day: number } | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() };
  }

  // Excel เก็บวันที่เป็นจำนวนวันนับจากปี 1899 จึงต้องแปลงก่อนเทียบกับวันที่จาก CSV
  if (typeof value === "number" && value > 20_000 && value < 100_000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000);
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  }

  const text = String(value ?? "").trim();
  if (!text) return null;
  const parts = text.match(/^(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})/);
  if (!parts) return null;

  let year: number;
  let month: number;
  let day: number;
  if (parts[1].length === 4) {
    year = Number(parts[1]);
    month = Number(parts[2]);
    day = Number(parts[3]);
  } else {
    day = Number(parts[1]);
    month = Number(parts[2]);
    year = Number(parts[3]);
  }
  if (year > 2400) year -= 543;
  if (year < 100) year += 2000;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day };
}

function parseDate(value: unknown): Pick<ReconciliationItem, "dateKey" | "dateLabel"> | null {
  const parts = dateParts(value);
  if (!parts) return null;
  const dateKey = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  const dateLabel = `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}/${parts.year + 543}`;
  return { dateKey, dateLabel };
}

function amountFromRow(row: unknown[], columns: ColumnMap, _source: ReconciliationSource): number | null {
  const direct = columns.amount === undefined ? null : parseMoney(row[columns.amount]);
  if (direct !== null) return direct;

  const deposit = columns.deposit === undefined ? null : parseMoney(row[columns.deposit]);
  const withdrawal = columns.withdrawal === undefined ? null : parseMoney(row[columns.withdrawal]);
  if (deposit !== null && deposit !== 0) return Math.abs(deposit);
  if (withdrawal !== null && withdrawal !== 0) return -Math.abs(withdrawal);
  if (deposit !== null || withdrawal !== null) return 0;

  const debit = columns.debit === undefined ? null : parseMoney(row[columns.debit]);
  const credit = columns.credit === undefined ? null : parseMoney(row[columns.credit]);
  // รายงานนี้มองจากบัญชีเงินฝาก จึงใช้เดบิตเป็นเงินเข้าและเครดิตเป็นเงินออกเหมือนกันทั้งสองไฟล์
  if (debit !== null && debit !== 0) return Math.abs(debit);
  if (credit !== null && credit !== 0) return -Math.abs(credit);
  return debit !== null || credit !== null ? 0 : null;
}

export function parseReconciliationTable(table: unknown[][], source: ReconciliationSource): ReconciliationItem[] {
  let headerIndex = -1;
  let columns: ColumnMap | null = null;
  for (let index = 0; index < Math.min(table.length, 20); index++) {
    const detected = detectColumns(table[index]);
    if (detected) {
      headerIndex = index;
      columns = detected;
      break;
    }
  }
  if (!columns) {
    throw new Error("ไม่พบหัวคอลัมน์วันที่และจำนวนเงิน กรุณาใช้คอลัมน์ วันที่ พร้อมกับ จำนวนเงิน หรือ เดบิต/เครดิต");
  }

  const items: ReconciliationItem[] = [];
  for (let index = headerIndex + 1; index < table.length; index++) {
    const row = table[index];
    const date = parseDate(row[columns.date]);
    const amount = amountFromRow(row, columns, source);
    if (!date || amount === null || amount === 0) continue;
    items.push({
      rowNumber: index + 1,
      ...date,
      detail: [...new Set(columns.details.map((column) => String(row[column] ?? "").trim()).filter(Boolean))].join(" — "),
      amount,
    });
  }
  return items;
}

const GENERIC_DETAIL_WORDS = new Set([
  "โอนเงิน", "รับโอนเงิน", "จ่าย", "รับ", "โอนไป", "โอนจาก", "วันที่", "บริษัท", "บจ", "จำกัด",
  "นางสาว", "นส", "นาย", "ค่าจ้าง", "ไลฟ์", "ขายสินค้า", "หัก", "ณ", "ที่จ่าย", "test",
]);

function detailTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/\+{2,}/g, "")
    // สระและวรรณยุกต์ไทยเป็น Unicode Mark ถ้าตัดออกคำเดียวกันจะกลายเป็นเศษคำและจับคู่ผิด
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !GENERIC_DETAIL_WORDS.has(token) && !/^x\d+$/i.test(token));
}

function detailCommonWords(left: string, right: string): string[] {
  const leftTokens = detailTokens(left);
  const rightTokens = detailTokens(right);
  if (!leftTokens.length || !rightTokens.length) return [];
  return [...new Set(leftTokens.filter((leftToken) => rightTokens.some((rightToken) => (
    leftToken === rightToken
    || (Math.min(leftToken.length, rightToken.length) >= 4 && (leftToken.startsWith(rightToken) || rightToken.startsWith(leftToken)))
  ))))].slice(0, 3);
}

function daysBetween(left: string, right: string): number {
  return Math.round(Math.abs(Date.parse(left) - Date.parse(right)) / 86_400_000);
}

export function reconcileBankRows(
  bankRows: ReconciliationItem[],
  ledgerRows: ReconciliationItem[],
  direction: ReconciliationDirection = "both",
): ReconciliationResultRow[] {
  // กรองก่อนสร้างคู่เพื่อให้รายการค้างสะท้อนเฉพาะทิศทางที่ผู้ใช้ต้องการตรวจจริง
  if (direction !== "both") {
    const accepts = direction === "in"
      ? (row: ReconciliationItem) => row.amount > 0
      : (row: ReconciliationItem) => row.amount < 0;
    bankRows = bankRows.filter(accepts);
    ledgerRows = ledgerRows.filter(accepts);
  }
  const candidates: Array<{
    bankIndex: number;
    ledgerIndex: number;
    daysApart: number;
    commonWords: string[];
    status: "matched" | "mismatched";
    matchKind: "same-date" | "near-date" | "amount-mismatch" | "detail-mismatch";
    score: number;
  }> = [];
  for (let bankIndex = 0; bankIndex < bankRows.length; bankIndex++) {
    for (let ledgerIndex = 0; ledgerIndex < ledgerRows.length; ledgerIndex++) {
      const bank = bankRows[bankIndex];
      const ledger = ledgerRows[ledgerIndex];
      const daysApart = daysBetween(bank.dateKey, ledger.dateKey);
      if (daysApart > 1) continue;
      const commonWords = detailCommonWords(bank.detail, ledger.detail);
      const sameAmount = bank.amount === ledger.amount;
      const matched = sameAmount && commonWords.length > 0;
      // ถ้ายอดหรือคำอธิบายไม่ตรง จะจับเป็นคู่สีแดงเฉพาะเมื่อวันที่/คำสำคัญช่วยยืนยันว่าเป็นรายการเดียวกัน
      if (!matched && commonWords.length === 0 && !(sameAmount && daysApart === 0)) continue;
      candidates.push({
        bankIndex,
        ledgerIndex,
        daysApart,
        commonWords,
        status: matched ? "matched" : "mismatched",
        matchKind: matched
          ? (daysApart === 0 ? "same-date" : "near-date")
          : (sameAmount ? "detail-mismatch" : "amount-mismatch"),
        score: (matched ? 10_000 : 5_000) + (daysApart === 0 ? 1_000 : 500) + commonWords.length * 100,
      });
    }
  }
  candidates.sort((left, right) => right.score - left.score || left.bankIndex - right.bankIndex || left.ledgerIndex - right.ledgerIndex);

  const usedBank = new Set<number>();
  const usedLedger = new Set<number>();
  const results: ReconciliationResultRow[] = [];
  for (const candidate of candidates) {
    if (usedBank.has(candidate.bankIndex) || usedLedger.has(candidate.ledgerIndex)) continue;
    usedBank.add(candidate.bankIndex);
    usedLedger.add(candidate.ledgerIndex);
    const bank = bankRows[candidate.bankIndex];
    const ledger = ledgerRows[candidate.ledgerIndex];
    results.push({
      id: `bank-${bank.rowNumber}`,
      dateKey: bank.dateKey,
      dateLabel: bank.dateLabel,
      bank,
      ledger,
      status: candidate.status,
      matched: candidate.status === "matched",
      matchKind: candidate.matchKind,
      daysApart: candidate.daysApart,
      commonWords: candidate.commonWords,
      amountDifference: bank.amount - ledger.amount,
    });
  }

  for (let bankIndex = 0; bankIndex < bankRows.length; bankIndex++) {
    if (usedBank.has(bankIndex)) continue;
    const bank = bankRows[bankIndex];
    results.push({
      id: `bank-${bank.rowNumber}`,
      dateKey: bank.dateKey,
      dateLabel: bank.dateLabel,
      bank,
      ledger: null,
      status: "not-found",
      matched: false,
      matchKind: null,
      daysApart: null,
      commonWords: [],
      amountDifference: bank.amount,
    });
  }
  for (let ledgerIndex = 0; ledgerIndex < ledgerRows.length; ledgerIndex++) {
    if (usedLedger.has(ledgerIndex)) continue;
    const ledger = ledgerRows[ledgerIndex];
    results.push({
      id: `ledger-${ledger.rowNumber}`,
      dateKey: ledger.dateKey,
      dateLabel: ledger.dateLabel,
      bank: null,
      ledger,
      status: "not-found",
      matched: false,
      matchKind: null,
      daysApart: null,
      commonWords: [],
      amountDifference: -ledger.amount,
    });
  }

  return results.sort((left, right) => left.dateKey.localeCompare(right.dateKey) || left.id.localeCompare(right.id));
}

export function summarizeReconciliationRows(rows: ReconciliationResultRow[]): ReconciliationSummary {
  const bankAmounts = rows.flatMap((row) => row.bank ? [row.bank.amount] : []);
  const ledgerAmounts = rows.flatMap((row) => row.ledger ? [row.ledger.amount] : []);
  const bankIn = bankAmounts.filter((amount) => amount > 0).reduce((sum, amount) => sum + amount, 0);
  const ledgerIn = ledgerAmounts.filter((amount) => amount > 0).reduce((sum, amount) => sum + amount, 0);
  const bankOut = Math.abs(bankAmounts.filter((amount) => amount < 0).reduce((sum, amount) => sum + amount, 0));
  const ledgerOut = Math.abs(ledgerAmounts.filter((amount) => amount < 0).reduce((sum, amount) => sum + amount, 0));
  const bankNet = bankIn - bankOut;
  const ledgerNet = ledgerIn - ledgerOut;
  return {
    matchedCount: rows.filter((row) => row.status === "matched").length,
    mismatchedCount: rows.filter((row) => row.status === "mismatched").length,
    notFoundCount: rows.filter((row) => row.status === "not-found").length,
    bankIn,
    ledgerIn,
    inDifference: bankIn - ledgerIn,
    bankOut,
    ledgerOut,
    outDifference: bankOut - ledgerOut,
    bankNet,
    ledgerNet,
    netDifference: bankNet - ledgerNet,
  };
}

export function reconciliationAmountLabel(item: ReconciliationItem | null): string {
  return item ? fmtSatang(item.amount, { zeroDash: false }) : "—";
}
