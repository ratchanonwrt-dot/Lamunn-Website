import { prisma } from "@lamunn/db-finance";
import type { AccountType, Prisma } from "@lamunn/db-finance";
import { toSatang } from "./money";
import { GROUP } from "./chartOfAccounts";

/** ตัวสร้างงบทั้งสามใบ — งบทดลอง, งบกำไรขาดทุน, งบแสดงฐานะการเงิน
 *
 * ทั้งสามใบอ่านจากแหล่งเดียวกันคือบรรทัดรายการที่ "ผ่านรายการแล้ว" (POSTED) เท่านั้น
 * ใบสำคัญที่ยังเป็นร่างจะไม่เข้างบ — จึงเห็นผลของการอนุมัติได้ทันที
 *
 * ยอดคงเหลือทุกตัวในไฟล์นี้เก็บเป็น "สตางค์ ฝั่งเดบิตเป็นบวก" (closing = debit - credit)
 * แล้วค่อยกลับเครื่องหมายตอนแสดงผลตามหมวดบัญชี (ดู naturalAmount) */

export interface AccountBalance {
  id: string;
  code: string;
  nameTh: string;
  type: AccountType;
  parentCode: string | null;
  isPostable: boolean;
  opening: number; // ยอดยกมา (สตางค์, เดบิตเป็นบวก)
  debit: number; // เดบิตในงวด
  credit: number; // เครดิตในงวด
  closing: number; // ยอดยกไป
}

/** หมวดที่ยอดคงเหลือปกติอยู่ด้านเครดิต — ต้องกลับเครื่องหมายก่อนแสดงในงบ */
const CREDIT_NATURED: AccountType[] = ["LIABILITY", "EQUITY", "REVENUE"];

/** แปลงยอด "เดบิตเป็นบวก" เป็นยอดที่คนอ่านงบคาดหวัง (รายได้/หนี้สินเป็นบวก) */
export function naturalAmount(type: AccountType, debitPositive: number): number {
  return CREDIT_NATURED.includes(type) ? -debitPositive : debitPositive;
}

async function sumLines(where: Prisma.AccJournalLineWhereInput) {
  const rows = await prisma.accJournalLine.groupBy({
    by: ["accountId"],
    _sum: { debit: true, credit: true },
    where,
  });
  const map = new Map<string, { debit: number; credit: number }>();
  for (const r of rows) {
    map.set(r.accountId, { debit: toSatang(r._sum.debit), credit: toSatang(r._sum.credit) });
  }
  return map;
}

/** ยอดคงเหลือทุกบัญชี: ยอดยกมาก่อนวันที่ `from` + ความเคลื่อนไหวในช่วง from..to
 * ถ้าไม่ส่ง `from` มา จะถือว่าเป็นยอดสะสมตั้งแต่ต้น (ใช้กับงบแสดงฐานะการเงิน) */
export async function loadBalances(opts: { from?: Date; to: Date; branchId?: string }): Promise<AccountBalance[]> {
  const branchFilter = opts.branchId ? { branchId: opts.branchId } : {};

  const [accounts, openingMap, periodMap] = await Promise.all([
    prisma.accAccount.findMany({ orderBy: { code: "asc" } }),
    // กรองจากคอลัมน์ของบรรทัดเองทั้งหมด ไม่แตะตารางใบสำคัญ — ใช้ index [status, date, accountId] ได้เต็มๆ
    opts.from
      ? sumLines({ ...branchFilter, status: "POSTED", date: { lt: opts.from } })
      : Promise.resolve(new Map<string, { debit: number; credit: number }>()),
    sumLines({
      ...branchFilter,
      status: "POSTED",
      date: { ...(opts.from ? { gte: opts.from } : {}), lte: opts.to },
    }),
  ]);

  return accounts.map((a) => {
    const o = openingMap.get(a.id) ?? { debit: 0, credit: 0 };
    const p = periodMap.get(a.id) ?? { debit: 0, credit: 0 };
    const opening = o.debit - o.credit;
    return {
      id: a.id,
      code: a.code,
      nameTh: a.nameTh,
      type: a.type,
      parentCode: a.parentCode,
      isPostable: a.isPostable,
      opening,
      debit: p.debit,
      credit: p.credit,
      closing: opening + p.debit - p.credit,
    };
  });
}

// ───────────────────────────────── งบทดลอง ─────────────────────────────────

export interface TrialBalance {
  rows: AccountBalance[];
  totalOpeningDr: number;
  totalOpeningCr: number;
  totalDebit: number;
  totalCredit: number;
  totalClosingDr: number;
  totalClosingCr: number;
  balanced: boolean;
}

/** งบทดลอง — ตรวจว่าเดบิตรวมเท่ากับเครดิตรวมก่อนปิดงวด
 * แสดงเฉพาะบัญชีที่มียอดยกมาหรือมีความเคลื่อนไหว (บัญชีว่างเปล่าไม่ต้องรก) */
export function buildTrialBalance(balances: AccountBalance[]): TrialBalance {
  const rows = balances.filter((b) => b.opening !== 0 || b.debit !== 0 || b.credit !== 0);

  const t: TrialBalance = {
    rows,
    totalOpeningDr: 0,
    totalOpeningCr: 0,
    totalDebit: 0,
    totalCredit: 0,
    totalClosingDr: 0,
    totalClosingCr: 0,
    balanced: false,
  };

  for (const r of rows) {
    if (r.opening > 0) t.totalOpeningDr += r.opening;
    else t.totalOpeningCr += -r.opening;
    t.totalDebit += r.debit;
    t.totalCredit += r.credit;
    if (r.closing > 0) t.totalClosingDr += r.closing;
    else t.totalClosingCr += -r.closing;
  }

  t.balanced = t.totalDebit === t.totalCredit && t.totalClosingDr === t.totalClosingCr;
  return t;
}

// ─────────────────────────── การจัดกลุ่มบรรทัดในงบ ───────────────────────────

/** บัญชีที่ทีมบัญชีเพิ่มเองโดยไม่ได้ระบุกลุ่ม จะถูกจัดเข้ากลุ่มเริ่มต้นตามหมวด
 * เพื่อไม่ให้ตกหล่นจากงบ (ยอดในงบต้องครบเสมอ ไม่งั้นงบไม่ลงตัว) */
const FALLBACK_GROUP: Record<AccountType, string> = {
  ASSET: GROUP.CURRENT_ASSET,
  LIABILITY: GROUP.CURRENT_LIABILITY,
  EQUITY: GROUP.EQUITY,
  REVENUE: GROUP.REVENUE,
  EXPENSE: GROUP.ADMIN_EXPENSE,
};

const ALL_GROUPS = new Set<string>(Object.values(GROUP));

export interface StatementLine {
  code: string;
  nameTh: string;
  amount: number; // สตางค์ ฝั่งธรรมชาติของหมวดเป็นบวก
}

export interface StatementSection {
  code: string;
  title: string;
  lines: StatementLine[];
  total: number;
}

function groupOf(b: AccountBalance): string {
  if (b.parentCode && ALL_GROUPS.has(b.parentCode)) return b.parentCode;
  return FALLBACK_GROUP[b.type];
}

const GROUP_TITLES: Record<string, string> = {
  [GROUP.CURRENT_ASSET]: "สินทรัพย์หมุนเวียน",
  [GROUP.NON_CURRENT_ASSET]: "สินทรัพย์ไม่หมุนเวียน",
  [GROUP.CURRENT_LIABILITY]: "หนี้สินหมุนเวียน",
  [GROUP.NON_CURRENT_LIABILITY]: "หนี้สินไม่หมุนเวียน",
  [GROUP.EQUITY]: "ส่วนของผู้ถือหุ้น",
  [GROUP.REVENUE]: "รายได้จากการขายและบริการ",
  [GROUP.OTHER_INCOME]: "รายได้อื่น",
  [GROUP.COGS]: "ต้นทุนขาย",
  [GROUP.SELLING_EXPENSE]: "ค่าใช้จ่ายในการขาย",
  [GROUP.ADMIN_EXPENSE]: "ค่าใช้จ่ายในการบริหาร",
  [GROUP.FINANCE_TAX]: "ต้นทุนทางการเงินและภาษี",
};

/** รวมยอดเป็นรายกลุ่ม โดยใช้ยอด "ในงวด" (สำหรับงบกำไรขาดทุน) หรือ "ยอดคงเหลือ" (สำหรับงบดุล) */
function section(balances: AccountBalance[], groupCode: string, useMovement: boolean): StatementSection {
  const lines: StatementLine[] = [];
  let total = 0;

  for (const b of balances) {
    if (!b.isPostable) continue;
    if (groupOf(b) !== groupCode) continue;
    const raw = useMovement ? b.debit - b.credit : b.closing;
    const amount = naturalAmount(b.type, raw);
    if (amount === 0) continue;
    lines.push({ code: b.code, nameTh: b.nameTh, amount });
    total += amount;
  }

  return { code: groupCode, title: GROUP_TITLES[groupCode] ?? groupCode, lines, total };
}

// ──────────────────────────── งบกำไรขาดทุน ────────────────────────────

export interface IncomeStatement {
  revenue: StatementSection;
  otherIncome: StatementSection;
  totalRevenue: number;
  cogs: StatementSection;
  // เก็บกำไรขั้นต้นไว้ให้ผู้เรียกเดิมใช้ต่อได้ แม้หน้ารายงานใหม่ไม่แสดงบรรทัดนี้
  grossProfit: number;
  sellingExpense: StatementSection;
  adminExpense: StatementSection;
  totalExpenses: number;
  operatingProfit: number;
  financeCost: StatementSection;
  profitBeforeTax: number;
  incomeTax: StatementSection;
  // เก็บหมวดรวมไว้ให้โค้ดเดิมที่อ้างอิงยังใช้งานได้ แต่หน้ารายงานแสดงแยกสองหมวดด้านบน
  financeTax: StatementSection;
  netProfit: number;
}

function splitSection(source: StatementSection, title: string, predicate: (line: StatementLine) => boolean): StatementSection {
  const lines = source.lines.filter(predicate);
  return {
    code: source.code,
    title,
    lines,
    total: lines.reduce((sum, line) => sum + line.amount, 0),
  };
}

/** บัญชี 5920 และบัญชีย่อยของมันเป็นภาษีเงินได้ ส่วนบัญชีอื่นใต้ 5900 เป็นต้นทุนทางการเงิน
 * การแยกจากรหัสทำให้ชื่อบัญชีที่ผู้ใช้แก้เองไม่ทำให้ยอดย้ายหมวดโดยไม่ตั้งใจ */
function isIncomeTaxLine(line: StatementLine): boolean {
  return line.code === "5920" || line.code.startsWith("5920.") || line.code.startsWith("5920-");
}

/** งบกำไรขาดทุน — ใช้เฉพาะความเคลื่อนไหวในงวดที่เลือก (ไม่รวมยอดยกมา) */
export function buildIncomeStatement(balances: AccountBalance[]): IncomeStatement {
  const revenue = section(balances, GROUP.REVENUE, true);
  const cogs = section(balances, GROUP.COGS, true);
  const otherIncome = section(balances, GROUP.OTHER_INCOME, true);
  const sellingExpense = section(balances, GROUP.SELLING_EXPENSE, true);
  const adminExpense = section(balances, GROUP.ADMIN_EXPENSE, true);
  const financeTax = section(balances, GROUP.FINANCE_TAX, true);
  const financeCost = splitSection(financeTax, "ต้นทุนทางการเงิน", (line) => !isIncomeTaxLine(line));
  const incomeTax = splitSection(financeTax, "ภาษีเงินได้", isIncomeTaxLine);

  const totalRevenue = revenue.total + otherIncome.total;
  const totalExpenses = cogs.total + sellingExpense.total + adminExpense.total;
  const grossProfit = revenue.total - cogs.total;
  const operatingProfit = totalRevenue - totalExpenses;
  const profitBeforeTax = operatingProfit - financeCost.total;
  const netProfit = profitBeforeTax - incomeTax.total;

  return {
    revenue,
    otherIncome,
    totalRevenue,
    cogs,
    grossProfit,
    sellingExpense,
    adminExpense,
    totalExpenses,
    operatingProfit,
    financeCost,
    profitBeforeTax,
    incomeTax,
    financeTax,
    netProfit,
  };
}

// ─────────────────────── งบแสดงฐานะการเงิน (งบดุล) ───────────────────────

export interface BalanceSheet {
  currentAssets: StatementSection;
  nonCurrentAssets: StatementSection;
  totalAssets: number;
  currentLiabilities: StatementSection;
  nonCurrentLiabilities: StatementSection;
  totalLiabilities: number;
  equity: StatementSection;
  unclosedProfit: number; // กำไร(ขาดทุน)สะสมของงวดที่ยังไม่ได้ปิดบัญชี
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  difference: number; // ต้องเป็น 0 เสมอ ถ้าไม่ใช่แปลว่ามีรายการผิดปกติ
}

/** งบแสดงฐานะการเงิน ณ วันที่หนึ่ง — ใช้ยอดสะสมตั้งแต่ต้นจนถึงวันนั้น
 *
 * รายได้/ค่าใช้จ่ายที่ยังไม่ได้ปิดเข้ากำไรสะสม จะถูกรวมเป็นบรรทัดเดียว
 * "กำไร(ขาดทุน)สะสมที่ยังไม่ปิดบัญชี" ในส่วนของผู้ถือหุ้น — งบจึงลงตัวเสมอ
 * ไม่ว่าจะปิดบัญชีสิ้นปีแล้วหรือยัง */
export function buildBalanceSheet(balances: AccountBalance[]): BalanceSheet {
  const currentAssets = section(balances, GROUP.CURRENT_ASSET, false);
  const nonCurrentAssets = section(balances, GROUP.NON_CURRENT_ASSET, false);
  const currentLiabilities = section(balances, GROUP.CURRENT_LIABILITY, false);
  const nonCurrentLiabilities = section(balances, GROUP.NON_CURRENT_LIABILITY, false);
  const equity = section(balances, GROUP.EQUITY, false);

  // กำไร = รายได้ - ค่าใช้จ่าย โดยใช้ยอดสะสมทั้งหมดถึงวันที่เลือก
  // (ถ้าปิดบัญชีสิ้นปีแล้ว ยอดพวกนี้จะถูกล้างเข้ากำไรสะสมไปเอง บรรทัดนี้จึงเหลือเฉพาะงวดที่ยังไม่ปิด)
  let unclosedProfit = 0;
  for (const b of balances) {
    if (b.type === "REVENUE") unclosedProfit += -b.closing;
    else if (b.type === "EXPENSE") unclosedProfit -= b.closing;
  }

  const totalAssets = currentAssets.total + nonCurrentAssets.total;
  const totalLiabilities = currentLiabilities.total + nonCurrentLiabilities.total;
  const totalEquity = equity.total + unclosedProfit;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

  return {
    currentAssets,
    nonCurrentAssets,
    totalAssets,
    currentLiabilities,
    nonCurrentLiabilities,
    totalLiabilities,
    equity,
    unclosedProfit,
    totalEquity,
    totalLiabilitiesAndEquity,
    difference: totalAssets - totalLiabilitiesAndEquity,
  };
}
