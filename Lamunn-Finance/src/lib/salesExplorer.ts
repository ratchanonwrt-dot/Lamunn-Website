import type { BranchLite, SalesRowLite } from "./reportsCalc";

/** "ดูยอดขายตามสาขา + ช่วงวัน" ของหน้ารายงาน — รวมยอดรายวันแยกช่องทางของสาขาที่เลือก แล้ววิเคราะห์ Trend
 *
 * ยอดหน้าร้าน: สาขาเงินสด = เงินสด + เงินโอน, สาขา Credit Term = ยอดรวมช่องเดียว (ห้างเก็บเงิน)
 * เก็บเงินสด/เงินโอนแยกไว้ด้วยเฉพาะสาขาเงินสด เพราะ Credit Term ไม่มีการแยกที่มีความหมาย
 *
 * Trend คิดจาก "วันที่มียอด" เท่านั้น (ยอดรวม > 0) — วันที่ยอดเป็น 0 คือไม่ได้เปิดหรือยังไม่ส่งยอด
 * ถ้านับรวมเส้นแนวโน้มจะดิ่งลงปลอมๆ ตอนท้ายช่วง (วันล่าสุดที่ยอดยังไม่เข้า) */

export interface ExplorerDay {
  date: string; // YYYY-MM-DD
  dow: number; // 0 = อาทิตย์
  cash: number;
  transfer: number;
  creditStorefront: number;
  storefront: number;
  grab: number;
  lineman: number;
  shopee: number;
  total: number;
  branchesWithSales: number;
  /** ค่าเฉลี่ยเคลื่อนที่ 7 วัน (เฉพาะวันที่มียอดในหน้าต่าง 7 วันปฏิทินล่าสุด) — null ถ้ายังไม่มีข้อมูล */
  ma7: number | null;
}

export interface ExplorerBranchRow {
  branch: BranchLite;
  openDays: number;
  storefront: number;
  grab: number;
  lineman: number;
  shopee: number;
  total: number;
  avgPerDay: number;
}

export interface ExplorerTrend {
  openDays: number;
  avgPerDay: number;
  /** ความชันเส้นตรง (บาท/วัน) จาก least squares บนวันที่มียอด */
  slopePerDay: number;
  /** ความชัน × 7 ÷ ค่าเฉลี่ย — โตหรือหดกี่ % ต่อสัปดาห์ */
  weeklyPct: number | null;
  /** ครึ่งหลังของช่วงเทียบครึ่งแรก (เฉลี่ยต่อวันที่มียอด) */
  halfChange: number | null;
  firstHalfAvg: number;
  secondHalfAvg: number;
  direction: "up" | "down" | "flat" | "none";
  best: ExplorerDay | null;
  worst: ExplorerDay | null;
  /** เฉลี่ยต่อวันแยกวันในสัปดาห์ index 0 = อาทิตย์ */
  byWeekday: { dow: number; days: number; avg: number }[];
}

export interface ExplorerResult {
  days: ExplorerDay[];
  branches: ExplorerBranchRow[];
  totals: { cash: number; transfer: number; creditStorefront: number; storefront: number; grab: number; lineman: number; shopee: number; total: number };
  trend: ExplorerTrend;
}

const FLAT_WEEKLY_PCT = 0.03; // ขึ้น/ลงไม่ถึง 3% ต่อสัปดาห์ = ทรงตัว

function pct(a: number, b: number): number | null {
  return b === 0 ? null : (a - b) / b;
}

export function computeSalesExplorer(
  allBranches: BranchLite[],
  rows: SalesRowLite[],
  branchIds: string[], // ว่าง = ทุกสาขา
  fromIso: string,
  toIso: string
): ExplorerResult {
  const from = new Date(`${fromIso}T00:00:00.000Z`);
  const to = new Date(`${toIso}T00:00:00.000Z`);
  const wanted = branchIds.length ? new Set(branchIds) : null;
  const typeOf = new Map(allBranches.map((b) => [b.id, b.type]));

  // เตรียมทุกวันปฏิทินในช่วง — วันที่ไม่มียอดก็ต้องโผล่ในตารางเป็น 0 ให้เห็นว่าขาดวันไหน
  const dayMap = new Map<string, ExplorerDay>();
  for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    dayMap.set(key, { date: key, dow: d.getUTCDay(), cash: 0, transfer: 0, creditStorefront: 0, storefront: 0, grab: 0, lineman: 0, shopee: 0, total: 0, branchesWithSales: 0, ma7: null });
  }

  const perBranch = new Map<string, ExplorerBranchRow>();
  for (const r of rows) {
    if (r.date < from || r.date > to) continue;
    if (wanted && !wanted.has(r.branchId)) continue;
    const type = typeOf.get(r.branchId);
    if (!type) continue;
    const day = dayMap.get(r.date.toISOString().slice(0, 10));
    if (!day) continue;

    const cash = type === "CASH" ? r.cashPos ?? 0 : 0;
    const transfer = type === "CASH" ? r.transfer ?? 0 : 0;
    const credit = type === "CASH" ? 0 : r.cashTransferCombined ?? 0;
    const storefront = cash + transfer + credit;
    const total = storefront + r.grab + r.lineman + r.shopee;

    day.cash += cash;
    day.transfer += transfer;
    day.creditStorefront += credit;
    day.storefront += storefront;
    day.grab += r.grab;
    day.lineman += r.lineman;
    day.shopee += r.shopee;
    day.total += total;
    if (total > 0) day.branchesWithSales += 1;

    let b = perBranch.get(r.branchId);
    if (!b) {
      const branch = allBranches.find((x) => x.id === r.branchId)!;
      b = { branch, openDays: 0, storefront: 0, grab: 0, lineman: 0, shopee: 0, total: 0, avgPerDay: 0 };
      perBranch.set(r.branchId, b);
    }
    b.storefront += storefront;
    b.grab += r.grab;
    b.lineman += r.lineman;
    b.shopee += r.shopee;
    b.total += total;
    if (total > 0) b.openDays += 1;
  }

  const days = [...dayMap.values()];
  // ค่าเฉลี่ยเคลื่อนที่ 7 วัน — เฉลี่ยเฉพาะวันที่มียอดในหน้าต่าง กันวันยอด 0 ลากเส้นลง
  for (let i = 0; i < days.length; i++) {
    const win = days.slice(Math.max(0, i - 6), i + 1).filter((d) => d.total > 0);
    days[i].ma7 = win.length ? win.reduce((a, d) => a + d.total, 0) / win.length : null;
  }

  const branches = [...perBranch.values()]
    .map((b) => ({ ...b, avgPerDay: b.openDays ? b.total / b.openDays : 0 }))
    .sort((a, b) => b.total - a.total);

  const totals = days.reduce(
    (a, d) => ({
      cash: a.cash + d.cash,
      transfer: a.transfer + d.transfer,
      creditStorefront: a.creditStorefront + d.creditStorefront,
      storefront: a.storefront + d.storefront,
      grab: a.grab + d.grab,
      lineman: a.lineman + d.lineman,
      shopee: a.shopee + d.shopee,
      total: a.total + d.total,
    }),
    { cash: 0, transfer: 0, creditStorefront: 0, storefront: 0, grab: 0, lineman: 0, shopee: 0, total: 0 }
  );

  return { days, branches, totals, trend: computeTrend(days) };
}

function computeTrend(days: ExplorerDay[]): ExplorerTrend {
  const open = days.map((d, i) => ({ d, x: i })).filter((p) => p.d.total > 0);
  const byWeekday = Array.from({ length: 7 }, (_, dow) => {
    const ds = open.filter((p) => p.d.dow === dow);
    return { dow, days: ds.length, avg: ds.length ? ds.reduce((a, p) => a + p.d.total, 0) / ds.length : 0 };
  });
  if (open.length === 0) {
    return { openDays: 0, avgPerDay: 0, slopePerDay: 0, weeklyPct: null, halfChange: null, firstHalfAvg: 0, secondHalfAvg: 0, direction: "none", best: null, worst: null, byWeekday };
  }

  const n = open.length;
  const mean = open.reduce((a, p) => a + p.d.total, 0) / n;
  const meanX = open.reduce((a, p) => a + p.x, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of open) {
    num += (p.x - meanX) * (p.d.total - mean);
    den += (p.x - meanX) ** 2;
  }
  const slopePerDay = den === 0 ? 0 : num / den;
  const weeklyPct = n >= 4 && mean > 0 ? (slopePerDay * 7) / mean : null;

  // แบ่งครึ่งตามวันปฏิทินของช่วง (ไม่ใช่ตามจำนวนวันที่มียอด) ให้ "ครึ่งแรก/ครึ่งหลัง" ตรงกับช่วงเวลาจริง
  const mid = Math.floor(days.length / 2);
  const first = open.filter((p) => p.x < mid);
  const second = open.filter((p) => p.x >= mid);
  const avg = (ps: typeof open) => (ps.length ? ps.reduce((a, p) => a + p.d.total, 0) / ps.length : 0);
  const firstHalfAvg = avg(first);
  const secondHalfAvg = avg(second);
  const halfChange = first.length && second.length ? pct(secondHalfAvg, firstHalfAvg) : null;

  const direction: ExplorerTrend["direction"] =
    weeklyPct === null ? "none" : Math.abs(weeklyPct) < FLAT_WEEKLY_PCT ? "flat" : weeklyPct > 0 ? "up" : "down";

  let best = open[0].d;
  let worst = open[0].d;
  for (const p of open) {
    if (p.d.total > best.total) best = p.d;
    if (p.d.total < worst.total) worst = p.d;
  }

  return { openDays: n, avgPerDay: mean, slopePerDay, weeklyPct, halfChange, firstHalfAvg, secondHalfAvg, direction, best, worst, byWeekday };
}
