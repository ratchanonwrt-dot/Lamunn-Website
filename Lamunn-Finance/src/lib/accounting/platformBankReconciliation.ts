import type { ReconciliationItem } from "./bankReconciliation";

export type PlatformCode = "GRAB" | "LINE_MAN" | "TIKTOK" | "SHOPEE";

export const PLATFORM_LABELS: Record<PlatformCode, string> = {
  GRAB: "Grab",
  LINE_MAN: "LINE MAN",
  TIKTOK: "TikTok",
  SHOPEE: "Shopee",
};

export type PlatformPayoutItem = {
  id: string;
  platform: PlatformCode;
  sourceName: string;
  rowNumber: number;
  dateKey: string;
  dateLabel: string;
  storeId: string;
  storeName: string;
  reference: string;
  detail: string;
  grossAmount: number;
  feeAmount: number;
  adjustmentAmount: number;
  payoutAmount: number;
};

export type PlatformReconciliationResult = {
  id: string;
  dateKey: string;
  dateLabel: string;
  bank: ReconciliationItem | null;
  payouts: PlatformPayoutItem[];
  platformTotal: number;
  inferredTransferFee: number;
  bankExpected: number;
  amountDifference: number;
  daysApart: number | null;
  status: "matched" | "mismatched" | "not-found";
};

export type PlatformReconciliationSummary = {
  matchedCount: number;
  mismatchedCount: number;
  notFoundCount: number;
  platformWithoutBankCount: number;
  bankWithoutPlatformCount: number;
  platformTotal: number;
  transferFeeTotal: number;
  bankExpectedTotal: number;
  bankTotal: number;
  difference: number;
};

const MONEY_PATTERN = String.raw`[+-]?(?:\(?-?[\d,]+(?:\.\d+)?\)?)`;
const STORE_HEADING_PATTERN = /^(?:รายรับทั้งหมด|รายรับแยก|ยอดขายแยก|ค่าบริการ|สรุปการเงิน|สรุปรายวัน|วันที่|หน้าที่)/;

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_./()\-]+/g, "");
}

function findColumn(headers: string[], aliases: string[]): number | undefined {
  const exact = headers.findIndex((header) => aliases.includes(header));
  if (exact >= 0) return exact;
  const partial = headers.findIndex((header) => aliases.some((alias) => alias.length >= 4 && header.includes(alias)));
  return partial >= 0 ? partial : undefined;
}

function decimalTextToSatang(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const original = String(value).trim();
  if (!original || original === "-") return null;
  const bracketNegative = /^\(.*\)$/.test(original);
  const cleaned = original.replace(/[฿,\s()]/g, "");
  const match = cleaned.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const negative = bracketNegative || match[1] === "-";
  const baht = Number(match[2]);
  const fraction = `${match[3] ?? ""}00`.slice(0, 2);
  const thirdDigit = Number((match[3] ?? "")[2] ?? "0");
  if (!Number.isSafeInteger(baht)) return null;
  const satang = baht * 100 + Number(fraction) + (thirdDigit >= 5 ? 1 : 0);
  return negative ? -satang : satang;
}

function parseDateText(value: unknown): { dateKey: string; dateLabel: string } | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return datePartsToLabels(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === "number" && value > 20_000 && value < 100_000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000);
    return datePartsToLabels(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})/);
  if (!match) return null;
  let day: number;
  let month: number;
  let year: number;
  if (match[1].length === 4) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  }
  if (year > 2400) year -= 543;
  if (year < 100) year += 2000;
  return datePartsToLabels(year, month, day);
}

function datePartsToLabels(year: number, month: number, day: number): { dateKey: string; dateLabel: string } | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return {
    dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    dateLabel: `${day}/${month}/${year + 543}`,
  };
}

function linesBefore(text: string, position: number): string[] {
  return text.slice(Math.max(0, position - 500), position)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** อ่านรายงานยอดขายรายเดือน LINE MAN ที่เป็น PDF แบบข้อความ ทั้งสาขาเดียวและไฟล์รวมหลายสาขา */
export function parseLineManReportText(text: string, sourceName: string): PlatformPayoutItem[] {
  const normalized = text.replace(/\u00a0/g, " ").replace(/\r/g, "");
  const markers = [...normalized.matchAll(/หมายเลขร้าน\s+([A-Za-z0-9]+)/g)];
  const rows: PlatformPayoutItem[] = [];

  markers.forEach((marker, markerIndex) => {
    const storeId = marker[1];
    const segmentEnd = markers[markerIndex + 1]?.index ?? normalized.length;
    const segment = normalized.slice(marker.index ?? 0, segmentEnd);
    const afterMarker = segment.slice(marker[0].length).replace(/^\s+/, "");
    const nextLine = afterMarker.split(/\r?\n/, 1)[0]?.trim() ?? "";
    const previousLines = linesBefore(normalized, marker.index ?? 0);
    const previousLine = [...previousLines].reverse().find((line) => (
      !line.includes("หน้าที่")
      && !line.includes("คำอธิบาย")
      && !line.startsWith("*")
    )) ?? "";
    const storeName = nextLine && !STORE_HEADING_PATTERN.test(nextLine) ? nextLine : previousLine;
    const compact = segment.replace(/\s+/g, " ");
    const dailyRow = new RegExp(
      String.raw`(\d{1,2}/\d{1,2}/\d{4})\s+(${MONEY_PATTERN})\s+(${MONEY_PATTERN})\s+(${MONEY_PATTERN})\s+(${MONEY_PATTERN})\s+(${MONEY_PATTERN})\s+(${MONEY_PATTERN})\s+(${MONEY_PATTERN})`,
      "g",
    );

    for (const match of compact.matchAll(dailyRow)) {
      const date = parseDateText(match[1]);
      const cash = decimalTextToSatang(match[2]);
      const ePayment = decimalTextToSatang(match[3]);
      const gp = decimalTextToSatang(match[4]);
      const paidService = decimalTextToSatang(match[5]);
      const adjustment = decimalTextToSatang(match[6]);
      const payout = decimalTextToSatang(match[8]);
      if (!date || cash === null || ePayment === null || gp === null || paidService === null || adjustment === null || payout === null) continue;
      // วันที่ยอดโอนเป็นศูนย์ยังมีประโยชน์ในรายงานต้นทาง แต่ไม่ใช่รายการที่ต้องค้นหาในธนาคาร
      if (payout <= 0) continue;
      rows.push({
        id: `LINE_MAN:${storeId}:${date.dateKey}:${payout}`,
        platform: "LINE_MAN",
        sourceName,
        rowNumber: rows.length + 1,
        ...date,
        storeId,
        storeName: storeName || storeId,
        reference: `${storeId}-${date.dateKey}`,
        detail: `LINE MAN ${storeName || storeId}`,
        grossAmount: cash + ePayment,
        feeAmount: paidService || gp,
        adjustmentAmount: adjustment,
        payoutAmount: payout,
      });
    }
  });

  return deduplicatePlatformPayouts(rows);
}

const DATE_HEADERS = ["date", "payoutdate", "transferdate", "settlementdate", "วันที่", "วันที่โอน", "วันโอน"];
const PAYOUT_HEADERS = [
  "netpayout", "payoutamount", "settlementamount", "netamount", "ยอดรับสุทธิ", "ยอดโอนสุทธิ",
  "ยอดโอนออกให้ร้าน", "ยอดที่ได้รับ", "ยอดเงินสุทธิ", "จำนวนเงิน",
].map(normalizeHeader);
const STORE_HEADERS = ["store", "storename", "branch", "branchname", "ร้าน", "ชื่อร้าน", "สาขา"].map(normalizeHeader);
const REFERENCE_HEADERS = ["reference", "referenceno", "settlementid", "payoutid", "เลขอ้างอิง", "รหัสอ้างอิง"].map(normalizeHeader);
const DETAIL_HEADERS = ["description", "detail", "รายละเอียด", "รายการ", "ช่องทาง"].map(normalizeHeader);

const SHOPEE_DATE_HEADERS = ["วันที่โอนชำระเงินสำเร็จ", "วันที่โอนสำเร็จ"].map(normalizeHeader);
const SHOPEE_PAYOUT_HEADERS = ["จำนวนเงินทั้งหมดที่โอนแล้ว", "จำนวนเงินทั้งหมดที่โอนแล้ว฿"].map(normalizeHeader);
const SHOPEE_STORE_HEADERS = ["Shop Name", "ชื่อร้าน"].map(normalizeHeader);
const SHOPEE_REFERENCE_HEADERS = ["หมายเลขคำสั่งซื้อ", "Order ID"].map(normalizeHeader);

const GRAB_DATE_HEADERS = ["วันที่โอน", "Transfer Date"].map(normalizeHeader);
const GRAB_REFERENCE_HEADERS = ["รหัสการทำรายการ", "Payout ID", "Settlement ID"].map(normalizeHeader);
const GRAB_STATUS_HEADERS = ["สถานะ", "Status"].map(normalizeHeader);
const GRAB_PAYOUT_HEADERS = ["ทั้งหมด", "Total"].map(normalizeHeader);
const GRAB_STORE_ID_HEADERS = ["รหัสร้านค้า", "Store ID"].map(normalizeHeader);

/** Grab ส่งข้อมูลระดับออเดอร์ จึงรวมยอดสุทธิตามรหัสการโอนก่อนนำไปเทียบกับรายการธนาคาร */
export function parseGrabReportTable(table: unknown[][], sourceName: string): PlatformPayoutItem[] {
  let headerIndex = -1;
  let dateColumn: number | undefined;
  let referenceColumn: number | undefined;
  let statusColumn: number | undefined;
  let payoutColumn: number | undefined;
  let storeIdColumn: number | undefined;
  let storeNameColumn: number | undefined;
  for (let index = 0; index < Math.min(table.length, 20); index++) {
    const headers = Array.from({ length: table[index].length }, (_, column) => normalizeHeader(table[index][column]));
    const detectedDate = findColumn(headers, GRAB_DATE_HEADERS);
    const detectedReference = findColumn(headers, GRAB_REFERENCE_HEADERS);
    const detectedPayout = findColumn(headers, GRAB_PAYOUT_HEADERS);
    if (detectedDate === undefined || detectedReference === undefined || detectedPayout === undefined) continue;
    headerIndex = index;
    dateColumn = detectedDate;
    referenceColumn = detectedReference;
    payoutColumn = detectedPayout;
    statusColumn = findColumn(headers, GRAB_STATUS_HEADERS);
    storeIdColumn = findColumn(headers, GRAB_STORE_ID_HEADERS);
    // ไฟล์ Grab มีหัวข้อชื่อร้านซ้ำ โดยคอลัมน์หลังเป็นชื่อสาขาที่ใช้กระทบยอด
    const storeColumns = headers
      .map((header, column) => ({ header, column }))
      .filter(({ header }) => header === normalizeHeader("ชื่อร้าน"));
    storeNameColumn = storeColumns.at(-1)?.column;
    break;
  }
  if (headerIndex < 0 || dateColumn === undefined || referenceColumn === undefined || payoutColumn === undefined) {
    throw new Error("ไม่พบคอลัมน์ วันที่โอน รหัสการทำรายการ และ ทั้งหมด ในไฟล์ Grab");
  }

  const groups = new Map<string, {
    dateKey: string;
    dateLabel: string;
    payoutAmount: number;
    storeId: string;
    storeName: string;
    rowCount: number;
    firstRow: number;
  }>();
  for (let index = headerIndex + 1; index < table.length; index++) {
    const row = table[index];
    const status = statusColumn === undefined ? "" : String(row[statusColumn] ?? "").trim().toLowerCase();
    if (status && status !== "โอนแล้ว" && status !== "transferred") continue;
    const reference = String(row[referenceColumn] ?? "").trim();
    const date = parseDateText(row[dateColumn]);
    const payoutAmount = decimalTextToSatang(row[payoutColumn]);
    if (!reference || !date || payoutAmount === null) continue;
    const group = groups.get(reference) ?? {
      ...date,
      payoutAmount: 0,
      storeId: storeIdColumn === undefined ? "" : String(row[storeIdColumn] ?? "").trim(),
      storeName: storeNameColumn === undefined ? "" : String(row[storeNameColumn] ?? "").trim(),
      rowCount: 0,
      firstRow: index + 1,
    };
    group.payoutAmount += payoutAmount;
    group.rowCount += 1;
    groups.set(reference, group);
  }

  return [...groups.entries()]
    .filter(([, group]) => group.payoutAmount > 0)
    .map(([reference, group]) => ({
      id: `GRAB:${reference}:${group.payoutAmount}`,
      platform: "GRAB" as const,
      sourceName,
      rowNumber: group.firstRow,
      dateKey: group.dateKey,
      dateLabel: group.dateLabel,
      storeId: group.storeId,
      storeName: group.storeName || "Grab",
      reference,
      detail: `Grab — ${group.storeName || "ไม่ระบุสาขา"} — ${reference} — ${group.rowCount.toLocaleString("th-TH")} รายการ`,
      grossAmount: 0,
      feeAmount: 0,
      adjustmentAmount: 0,
      payoutAmount: group.payoutAmount,
    }))
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey) || left.reference.localeCompare(right.reference));
}

/** Shopee ส่งรายการระดับคำสั่งซื้อ จึงต้องรวมทั้งยอดบวกและยอดคืนติดลบตามวันที่โอนก่อนเทียบธนาคาร */
export function parseShopeeReportTable(table: unknown[][], sourceName: string): PlatformPayoutItem[] {
  let headerIndex = -1;
  let dateColumn: number | undefined;
  let payoutColumn: number | undefined;
  let storeColumn: number | undefined;
  let referenceColumn: number | undefined;
  for (let index = 0; index < Math.min(table.length, 30); index++) {
    const headers = Array.from({ length: table[index].length }, (_, column) => normalizeHeader(table[index][column]));
    const detectedDate = findColumn(headers, SHOPEE_DATE_HEADERS);
    const detectedPayout = findColumn(headers, SHOPEE_PAYOUT_HEADERS);
    if (detectedDate === undefined || detectedPayout === undefined) continue;
    headerIndex = index;
    dateColumn = detectedDate;
    payoutColumn = detectedPayout;
    storeColumn = findColumn(headers, SHOPEE_STORE_HEADERS);
    referenceColumn = findColumn(headers, SHOPEE_REFERENCE_HEADERS);
    break;
  }
  if (headerIndex < 0 || dateColumn === undefined || payoutColumn === undefined) {
    throw new Error("ไม่พบคอลัมน์ วันที่โอนชำระเงินสำเร็จ และ จำนวนเงินทั้งหมดที่โอนแล้ว ใน Sheet Income");
  }

  const groups = new Map<string, {
    dateKey: string;
    dateLabel: string;
    payoutAmount: number;
    stores: Set<string>;
    references: Set<string>;
    firstRow: number;
  }>();
  for (let index = headerIndex + 1; index < table.length; index++) {
    const row = table[index];
    const date = parseDateText(row[dateColumn]);
    const payoutAmount = decimalTextToSatang(row[payoutColumn]);
    if (!date || payoutAmount === null || payoutAmount === 0) continue;
    const group = groups.get(date.dateKey) ?? {
      ...date,
      payoutAmount: 0,
      stores: new Set<string>(),
      references: new Set<string>(),
      firstRow: index + 1,
    };
    group.payoutAmount += payoutAmount;
    const store = storeColumn === undefined ? "" : String(row[storeColumn] ?? "").trim();
    const reference = referenceColumn === undefined ? "" : String(row[referenceColumn] ?? "").trim();
    if (store) group.stores.add(store);
    if (reference) group.references.add(reference);
    groups.set(date.dateKey, group);
  }

  return [...groups.values()]
    .filter((group) => group.payoutAmount > 0)
    .map((group) => {
      const stores = [...group.stores];
      const storeName = stores.length <= 3 ? stores.join(", ") : `${stores.length.toLocaleString("th-TH")} สาขา`;
      return {
        id: `SHOPEE:${group.dateKey}:${group.payoutAmount}`,
        platform: "SHOPEE" as const,
        sourceName,
        rowNumber: group.firstRow,
        dateKey: group.dateKey,
        dateLabel: group.dateLabel,
        storeId: "",
        storeName: storeName || "Shopee",
        reference: `${group.references.size.toLocaleString("th-TH")} คำสั่งซื้อ`,
        detail: `Shopee — ${storeName || "ไม่ระบุสาขา"} — ${group.references.size.toLocaleString("th-TH")} คำสั่งซื้อ`,
        grossAmount: 0,
        feeAmount: 0,
        adjustmentAmount: 0,
        payoutAmount: group.payoutAmount,
      };
    })
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey));
}

/** รองรับ Excel/CSV ที่มีคอลัมน์วันที่และยอดรับสุทธิเป็นรูปแบบกลางสำหรับทุกแพลตฟอร์ม */
export function parsePlatformTable(
  table: unknown[][],
  platform: PlatformCode,
  sourceName: string,
): PlatformPayoutItem[] {
  let headerIndex = -1;
  let dateColumn: number | undefined;
  let payoutColumn: number | undefined;
  let storeColumn: number | undefined;
  let referenceColumn: number | undefined;
  let detailColumn: number | undefined;
  for (let index = 0; index < Math.min(table.length, 30); index++) {
    const headers = Array.from({ length: table[index].length }, (_, column) => normalizeHeader(table[index][column]));
    const detectedDate = findColumn(headers, DATE_HEADERS.map(normalizeHeader));
    const detectedPayout = findColumn(headers, PAYOUT_HEADERS);
    if (detectedDate === undefined || detectedPayout === undefined) continue;
    headerIndex = index;
    dateColumn = detectedDate;
    payoutColumn = detectedPayout;
    storeColumn = findColumn(headers, STORE_HEADERS);
    referenceColumn = findColumn(headers, REFERENCE_HEADERS);
    detailColumn = findColumn(headers, DETAIL_HEADERS);
    break;
  }
  if (headerIndex < 0 || dateColumn === undefined || payoutColumn === undefined) {
    throw new Error("ไม่พบคอลัมน์วันที่และยอดรับสุทธิ กรุณาใช้หัวคอลัมน์ วันที่ พร้อมกับ ยอดรับสุทธิ หรือ ยอดโอนสุทธิ");
  }

  const rows: PlatformPayoutItem[] = [];
  for (let index = headerIndex + 1; index < table.length; index++) {
    const row = table[index];
    const date = parseDateText(row[dateColumn]);
    const payoutAmount = decimalTextToSatang(row[payoutColumn]);
    if (!date || payoutAmount === null || payoutAmount <= 0) continue;
    const storeName = storeColumn === undefined ? PLATFORM_LABELS[platform] : String(row[storeColumn] ?? "").trim();
    const reference = referenceColumn === undefined ? "" : String(row[referenceColumn] ?? "").trim();
    const detail = detailColumn === undefined ? "" : String(row[detailColumn] ?? "").trim();
    rows.push({
      id: `${platform}:${reference || storeName}:${date.dateKey}:${payoutAmount}:${index}`,
      platform,
      sourceName,
      rowNumber: index + 1,
      ...date,
      storeId: "",
      storeName: storeName || PLATFORM_LABELS[platform],
      reference,
      detail: [PLATFORM_LABELS[platform], storeName, detail, reference].filter(Boolean).join(" — "),
      grossAmount: 0,
      feeAmount: 0,
      adjustmentAmount: 0,
      payoutAmount,
    });
  }
  return deduplicatePlatformPayouts(rows);
}

export function deduplicatePlatformPayouts(rows: PlatformPayoutItem[]): PlatformPayoutItem[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    // รหัสโอนแยกธุรกรรมที่ยอดและสาขาเท่ากันได้ ส่วนไฟล์ที่ไม่มีรหัสยังใช้ข้อมูลร้านและวันที่เป็นตัวกันซ้ำ
    const identity = row.reference || `${row.storeId || row.storeName}|${row.dateKey}`;
    const key = `${row.platform}|${identity}|${row.payoutAmount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function daysFromPlatformToBank(platformDate: string, bankDate: string): number {
  return Math.round((Date.parse(bankDate) - Date.parse(platformDate)) / 86_400_000);
}

function findSubset(rows: PlatformPayoutItem[], target: number): number[] | null {
  if (target <= 0) return null;
  const sums = new Map<number, number[]>([[0, []]]);
  rows.forEach((row, index) => {
    const current = [...sums.entries()];
    for (const [sum, indices] of current) {
      const next = sum + row.payoutAmount;
      if (next > target || sums.has(next)) continue;
      sums.set(next, [...indices, index]);
    }
  });
  return sums.get(target) ?? null;
}

function platformAliases(platform: PlatformCode): string[] {
  if (platform === "LINE_MAN") return ["lineman", "line man", "wongnai", "ไลน์แมน"];
  if (platform === "TIKTOK") return ["tiktok", "tik tok"];
  return [PLATFORM_LABELS[platform].toLowerCase()];
}

function bankMentionsPlatform(detail: string, platform: PlatformCode): boolean {
  const normalized = detail.toLowerCase();
  return platformAliases(platform).some((alias) => normalized.includes(alias));
}

function bankMentionsDifferentPlatform(detail: string, platform: PlatformCode): boolean {
  return (Object.keys(PLATFORM_LABELS) as PlatformCode[])
    .some((code) => code !== platform && bankMentionsPlatform(detail, code));
}

function bankWithoutPlatformResult(bank: ReconciliationItem): PlatformReconciliationResult {
  return {
    id: `bank-without-platform-${bank.rowNumber}`,
    dateKey: bank.dateKey,
    dateLabel: bank.dateLabel,
    bank,
    payouts: [],
    platformTotal: 0,
    inferredTransferFee: 0,
    bankExpected: 0,
    amountDifference: bank.amount,
    daysApart: null,
    status: "not-found",
  };
}

export function reconcilePlatformPayouts(
  bankRows: ReconciliationItem[],
  payoutRows: PlatformPayoutItem[],
  platform: PlatformCode,
  options?: { allowMismatched?: boolean },
): PlatformReconciliationResult[] {
  // ให้รายการที่ธนาคารระบุชื่อแพลตฟอร์มตรงๆ ได้จับคู่ก่อน เพื่อลดการชนกับเงินเข้าจำนวนเท่ากันจากช่องทางอื่น
  const incomingBankRows = bankRows
    .filter((row) => row.amount > 0 && !bankMentionsDifferentPlatform(row.detail, platform))
    .sort((left, right) => (
      Number(bankMentionsPlatform(right.detail, platform)) - Number(bankMentionsPlatform(left.detail, platform))
      || left.dateKey.localeCompare(right.dateKey)
      || left.rowNumber - right.rowNumber
    ));
  const payouts = deduplicatePlatformPayouts(payoutRows.filter((row) => row.platform === platform && row.payoutAmount > 0));
  const usedPayouts = new Set<string>();
  const results: PlatformReconciliationResult[] = [];
  const payoutDates = [...new Set(payouts.map((row) => row.dateKey))].sort();

  for (const bank of incomingBankRows) {
    const candidates: Array<{
      rows: PlatformPayoutItem[];
      dayGap: number;
      fee: number;
    }> = [];
    for (const payoutDate of payoutDates) {
      const dayGap = daysFromPlatformToBank(payoutDate, bank.dateKey);
      if (dayGap < 0 || dayGap > 5) continue;
      const available = payouts.filter((row) => row.dateKey === payoutDate && !usedPayouts.has(row.id));
      if (!available.length) continue;
      const fees = platform === "LINE_MAN" ? [0, 500] : [0];
      for (const fee of fees) {
        const indices = findSubset(available, bank.amount + fee);
        if (indices) candidates.push({ rows: indices.map((index) => available[index]), dayGap, fee });
      }
    }
    // บางแพลตฟอร์มรวมยอดหลายวันก่อนโอนจริง จึงลองจับชุดข้ามวันเมื่อไม่พบยอดตรงแบบรายวัน
    if (!candidates.length) {
      const available = payouts.filter((row) => {
        const dayGap = daysFromPlatformToBank(row.dateKey, bank.dateKey);
        return !usedPayouts.has(row.id) && dayGap >= 0 && dayGap <= 5;
      });
      const fees = platform === "LINE_MAN" ? [0, 500] : [0];
      for (const fee of fees) {
        const indices = findSubset(available, bank.amount + fee);
        if (!indices) continue;
        const rows = indices.map((index) => available[index]);
        const dayGap = Math.max(...rows.map((row) => daysFromPlatformToBank(row.dateKey, bank.dateKey)));
        candidates.push({ rows, dayGap, fee });
      }
    }
    candidates.sort((left, right) => left.dayGap - right.dayGap || left.fee - right.fee || right.rows.length - left.rows.length);
    const selected = candidates[0];
    if (selected) {
      selected.rows.forEach((row) => usedPayouts.add(row.id));
      const platformTotal = selected.rows.reduce((sum, row) => sum + row.payoutAmount, 0);
      const bankExpected = platformTotal - selected.fee;
      results.push({
        id: `bank-${bank.rowNumber}`,
        dateKey: bank.dateKey,
        dateLabel: bank.dateLabel,
        bank,
        payouts: selected.rows,
        platformTotal,
        inferredTransferFee: selected.fee,
        bankExpected,
        amountDifference: bank.amount - bankExpected,
        daysApart: selected.dayGap,
        status: "matched",
      });
      continue;
    }

    if (options?.allowMismatched === false) continue;

    if (!bankMentionsPlatform(bank.detail, platform)) {
      // รายการที่ไม่ระบุช่องทางก็ต้องแสดง เพื่อให้ผู้ใช้ตรวจเงินเข้าที่ไม่มีข้อมูลแพลตฟอร์มได้ครบ
      results.push(bankWithoutPlatformResult(bank));
      continue;
    }
    const nearestDate = payoutDates
      .map((dateKey) => ({ dateKey, gap: daysFromPlatformToBank(dateKey, bank.dateKey) }))
      .filter(({ gap }) => gap >= 0 && gap <= 5)
      .sort((left, right) => left.gap - right.gap)[0];
    if (!nearestDate) {
      // แสดงเงินเข้าที่ระบุชื่อแพลตฟอร์มแม้ไม่มีข้อมูลต้นทาง เพื่อไม่ให้ยอดธนาคารส่วนเกินหายจากผลกระทบยอด
      results.push(bankWithoutPlatformResult(bank));
      continue;
    }
    const nearestRows = payouts.filter((row) => row.dateKey === nearestDate.dateKey && !usedPayouts.has(row.id));
    if (!nearestRows.length) {
      results.push(bankWithoutPlatformResult(bank));
      continue;
    }
    nearestRows.forEach((row) => usedPayouts.add(row.id));
    const platformTotal = nearestRows.reduce((sum, row) => sum + row.payoutAmount, 0);
    results.push({
      id: `bank-${bank.rowNumber}`,
      dateKey: bank.dateKey,
      dateLabel: bank.dateLabel,
      bank,
      payouts: nearestRows,
      platformTotal,
      inferredTransferFee: 0,
      bankExpected: platformTotal,
      amountDifference: bank.amount - platformTotal,
      daysApart: nearestDate.gap,
      status: "mismatched",
    });
  }

  const unmatchedByDate = new Map<string, PlatformPayoutItem[]>();
  payouts.filter((row) => !usedPayouts.has(row.id)).forEach((row) => {
    unmatchedByDate.set(row.dateKey, [...(unmatchedByDate.get(row.dateKey) ?? []), row]);
  });
  for (const [dateKey, rows] of unmatchedByDate) {
    const platformTotal = rows.reduce((sum, row) => sum + row.payoutAmount, 0);
    results.push({
      id: `platform-${platform}-${dateKey}`,
      dateKey,
      dateLabel: rows[0].dateLabel,
      bank: null,
      payouts: rows,
      platformTotal,
      inferredTransferFee: 0,
      bankExpected: platformTotal,
      amountDifference: -platformTotal,
      daysApart: null,
      status: "not-found",
    });
  }

  return results.sort((left, right) => left.dateKey.localeCompare(right.dateKey) || left.id.localeCompare(right.id));
}

/**
 * กระทบยอดหลายแพลตฟอร์มในรอบเดียว โดยไม่ให้รายการธนาคารรายการเดียวถูกใช้ซ้ำ
 * รายการธนาคารที่ยังไม่พบคู่จะถูกเติมหลังจากลองครบทุกแพลตฟอร์มแล้วเท่านั้น
 */
export function reconcileAllPlatformPayouts(
  bankRows: ReconciliationItem[],
  payoutRows: PlatformPayoutItem[],
): PlatformReconciliationResult[] {
  const platforms = (Object.keys(PLATFORM_LABELS) as PlatformCode[])
    .filter((platform) => payoutRows.some((row) => row.platform === platform));
  let remainingBankRows = bankRows.filter((row) => row.amount > 0);
  const combined: PlatformReconciliationResult[] = [];
  const usedPayouts = new Set<string>();

  // รอบแรกจับเฉพาะยอดที่ตรงกันทุกแพลตฟอร์มก่อน ป้องกันยอดคลาดเคลื่อนของแพลตฟอร์มหนึ่ง
  // ไปแย่งรายการธนาคารที่ตรงพอดีกับอีกแพลตฟอร์มหนึ่ง
  for (const platform of platforms) {
    const platformResults = reconcilePlatformPayouts(remainingBankRows, payoutRows, platform, { allowMismatched: false });
    const matchedResults = platformResults.filter((row) => row.status === "matched");
    combined.push(...matchedResults);
    const usedBankRows = new Set(
      matchedResults.flatMap((row) => row.bank ? [row.bank.rowNumber] : []),
    );
    matchedResults.flatMap((row) => row.payouts).forEach((row) => usedPayouts.add(row.id));
    remainingBankRows = remainingBankRows.filter((row) => !usedBankRows.has(row.rowNumber));
  }

  // รอบสองค่อยจัดกลุ่มรายการที่ยอดไม่ตรง และรายการที่ไม่พบคู่
  for (const platform of platforms) {
    const remainingPayouts = payoutRows.filter((row) => row.platform === platform && !usedPayouts.has(row.id));
    if (!remainingPayouts.length) continue;
    const platformResults = reconcilePlatformPayouts(remainingBankRows, remainingPayouts, platform);
    const meaningfulResults = platformResults.filter((row) => row.payouts.length > 0);
    combined.push(...meaningfulResults);
    const usedBankRows = new Set(
      meaningfulResults.flatMap((row) => row.bank ? [row.bank.rowNumber] : []),
    );
    meaningfulResults.flatMap((row) => row.payouts).forEach((row) => usedPayouts.add(row.id));
    remainingBankRows = remainingBankRows.filter((row) => !usedBankRows.has(row.rowNumber));
  }

  combined.push(...remainingBankRows.map(bankWithoutPlatformResult));
  return combined.sort((left, right) => left.dateKey.localeCompare(right.dateKey) || left.id.localeCompare(right.id));
}

export function summarizePlatformReconciliation(rows: PlatformReconciliationResult[]): PlatformReconciliationSummary {
  const platformTotal = rows.reduce((sum, row) => sum + row.platformTotal, 0);
  const transferFeeTotal = rows.reduce((sum, row) => sum + row.inferredTransferFee, 0);
  const bankExpectedTotal = rows.reduce((sum, row) => sum + row.bankExpected, 0);
  const bankTotal = rows.reduce((sum, row) => sum + (row.bank?.amount ?? 0), 0);
  return {
    matchedCount: rows.filter((row) => row.status === "matched").length,
    mismatchedCount: rows.filter((row) => row.status === "mismatched").length,
    notFoundCount: rows.filter((row) => row.status === "not-found").length,
    platformWithoutBankCount: rows.filter((row) => row.status === "not-found" && !row.bank).length,
    bankWithoutPlatformCount: rows.filter((row) => row.status === "not-found" && Boolean(row.bank) && row.payouts.length === 0).length,
    platformTotal,
    transferFeeTotal,
    bankExpectedTotal,
    bankTotal,
    difference: bankTotal - bankExpectedTotal,
  };
}
