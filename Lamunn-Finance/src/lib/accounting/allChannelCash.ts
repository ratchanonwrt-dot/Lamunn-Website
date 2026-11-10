import { signedInputToSatang, toBaht, toSatang } from "./money";

export type CashBranch = { key: string; name: string; order: number };
export type CashDayRow = { day: number; amounts: number[]; total: number };
export type CashReport = {
  year: number;
  month: number;
  sourceFile: string | null;
  branches: CashBranch[];
  rows: CashDayRow[];
  branchTotals: number[];
  grandTotal: number;
};

function normalizeCell(value: string | undefined) {
  return (value ?? "").replace(/\u00a0/g, " ").trim();
}

function branchKey(name: string, index: number) {
  const normalized = name.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9ก-๙]+/g, "-").replace(/^-|-$/g, "");
  return normalized || `branch-${index + 1}`;
}

/** ไฟล์จาก Pivot มีหัวตารางเลื่อนได้ จึงค้นหาคำว่า Row Labels แทนการผูกกับเลขแถวตายตัว */
export function parseAllChannelCashGrid(grid: string[][]) {
  const headerIndex = grid.slice(0, 12).findIndex((row) => {
    const cells = row.map(normalizeCell);
    return cells.some((cell) => /^row labels$/i.test(cell)) && cells.some((cell) => /^grand total$/i.test(cell));
  });
  if (headerIndex < 0) throw new Error("ไม่พบหัวตาราง Row Labels และ Grand Total ในไฟล์ Cash");

  const header = grid[headerIndex].map(normalizeCell);
  const firstColumn = header.findIndex((cell) => /^row labels$/i.test(cell));
  const totalColumn = header.findIndex((cell, index) => index > firstColumn && /^grand total$/i.test(cell));
  if (firstColumn < 0 || totalColumn <= firstColumn + 1) throw new Error("ไม่พบคอลัมน์สาขาในไฟล์ Cash");

  const seen = new Set<string>();
  const branches = header.slice(firstColumn + 1, totalColumn).map((name, index) => {
    if (!name) throw new Error(`ชื่อสาขาคอลัมน์ที่ ${index + 1} ว่างเปล่า`);
    let key = branchKey(name, index);
    if (seen.has(key)) key = `${key}-${index + 1}`;
    seen.add(key);
    return { key, name, order: index };
  });

  const rows: CashDayRow[] = [];
  for (const sourceRow of grid.slice(headerIndex + 1)) {
    const label = normalizeCell(sourceRow[firstColumn]);
    if (/^grand total$/i.test(label)) break;
    if (!/^\d{1,2}$/.test(label)) continue;
    const day = Number(label);
    if (day < 1 || day > 31 || rows.some((row) => row.day === day)) continue;
    const amounts = branches.map((_, index) => signedInputToSatang(sourceRow[firstColumn + 1 + index]));
    rows.push({ day, amounts, total: amounts.reduce((sum, amount) => sum + amount, 0) });
  }
  if (rows.length === 0) throw new Error("ไม่พบยอดขายรายวันในไฟล์ Cash");
  rows.sort((a, b) => a.day - b.day);
  const branchTotals = branches.map((_, index) => rows.reduce((sum, row) => sum + row.amounts[index], 0));
  return { branches, rows, branchTotals, grandTotal: branchTotals.reduce((sum, amount) => sum + amount, 0) };
}

export async function replaceAllChannelCashReport(input: {
  year: number;
  month: number;
  sourceFile: string;
  createdBy?: string;
  parsed: ReturnType<typeof parseAllChannelCashGrid>;
}) {
  const { prisma } = await import("@lamunn/db-finance");
  const existing = await prisma.accAllChannelCashDaily.findMany({
    where: { periodYear: input.year, periodMonth: input.month },
    select: { id: true },
  });
  await prisma.$transaction(async (tx) => {
    // ลบด้วย id ที่อ่านได้จริงเท่านั้น เพื่อไม่ให้เงื่อนไขกว้างไปโดนงวดอื่น
    if (existing.length) await tx.accAllChannelCashDaily.deleteMany({ where: { id: { in: existing.map((row) => row.id) } } });
    await tx.accAllChannelCashDaily.createMany({
      data: input.parsed.rows.flatMap((row) => input.parsed.branches.map((branch, index) => ({
        periodYear: input.year,
        periodMonth: input.month,
        day: row.day,
        branchKey: branch.key,
        branchName: branch.name,
        branchOrder: branch.order,
        amount: toBaht(row.amounts[index]),
        sourceFile: input.sourceFile,
        createdBy: input.createdBy,
      }))),
    });
  });
  return loadAllChannelCashReport(input.year, input.month);
}

export async function loadAllChannelCashReport(year: number, month: number): Promise<CashReport> {
  const { prisma } = await import("@lamunn/db-finance");
  const records = await prisma.accAllChannelCashDaily.findMany({
    where: { periodYear: year, periodMonth: month },
    orderBy: [{ day: "asc" }, { branchOrder: "asc" }],
  });
  if (!records.length) return { year, month, sourceFile: null, branches: [], rows: [], branchTotals: [], grandTotal: 0 };
  const firstDay = records[0].day;
  const branches = records.filter((row) => row.day === firstDay).map((row) => ({ key: row.branchKey, name: row.branchName, order: row.branchOrder }));
  const byDay = new Map<number, Map<string, number>>();
  for (const record of records) {
    if (!byDay.has(record.day)) byDay.set(record.day, new Map());
    byDay.get(record.day)!.set(record.branchKey, toSatang(record.amount));
  }
  const rows = [...byDay.entries()].sort(([a], [b]) => a - b).map(([day, values]) => {
    const amounts = branches.map((branch) => values.get(branch.key) ?? 0);
    return { day, amounts, total: amounts.reduce((sum, amount) => sum + amount, 0) };
  });
  const branchTotals = branches.map((_, index) => rows.reduce((sum, row) => sum + row.amounts[index], 0));
  return {
    year,
    month,
    sourceFile: records[0].sourceFile,
    branches,
    rows,
    branchTotals,
    grandTotal: branchTotals.reduce((sum, amount) => sum + amount, 0),
  };
}

export async function clearAllChannelCashReport(year: number, month: number) {
  const { prisma } = await import("@lamunn/db-finance");
  const existing = await prisma.accAllChannelCashDaily.findMany({
    where: { periodYear: year, periodMonth: month },
    select: { id: true },
  });
  // ใช้ id ที่อ่านได้จากเดือนเป้าหมายเท่านั้น เพื่อไม่ให้การล้างรายงานลามไปงวดอื่น
  if (existing.length) {
    await prisma.accAllChannelCashDaily.deleteMany({ where: { id: { in: existing.map((row) => row.id) } } });
  }
  return existing.length;
}
