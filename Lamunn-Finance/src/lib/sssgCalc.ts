import type { BranchLite, SalesRowLite } from "./reportsCalc";

/** Same-Store Sales Growth แบบ "นับเฉพาะวันที่เปิดขายจริง"
 *
 * โจทย์: เทียบยอดสาขาเดิมเดือนนี้กับเดือนก่อน โดยไม่ให้จำนวนวันที่ต่างกันมาบิดเบือน — เดือนนี้อาจผ่านมาแค่ 19 วัน
 * เดือนก่อนเต็ม 31 วัน บางสาขาหยุดซ่อม/ห้างปิด/ยังไม่ส่งยอดบางวัน (ยอด 0) ถ้าเอายอดรวมมาหารจำนวนวันปฏิทินจะผิด
 *
 * วิธีคิด: ของแต่ละสาขาในแต่ละเดือน นับเฉพาะวันที่ยอดรวม (หน้าร้าน+Grab+Lineman) > 0 = "วันที่เปิดจริง"
 * แล้วคิด "ยอดเฉลี่ยต่อวันที่เปิดจริง" ของเดือนนั้น — สาขาที่เทียบได้ (same-store) คือสาขาที่มีวันเปิดจริงทั้งสองเดือน
 * สาขาใหม่ (เดือนก่อนไม่มีวันเปิด) และสาขาที่ปิดไปแล้ว (เดือนนี้ไม่มีวันเปิด) ถูกตัดออก
 * ตัวเลขรวมของบริษัท = ผลรวมยอดเฉลี่ยต่อวันของสาขาเดิมทุกสาขา (เดือนนี้ vs เดือนก่อน) */

export interface ChannelTotals {
  storefront: number;
  grab: number;
  lineman: number;
  shopee: number;
}

export interface PeriodStat extends ChannelTotals {
  total: number;
  openDays: number;
  /** ยอดเฉลี่ยต่อวันที่เปิดจริง (0 ถ้าไม่มีวันเปิดเลย) */
  avgPerDay: number;
  avgChannel: ChannelTotals;
}

export interface SssgBranchRow {
  branch: BranchLite;
  current: PeriodStat;
  previous: PeriodStat;
  /** % เปลี่ยนแปลงของยอดเฉลี่ยต่อวัน — null ถ้าเทียบไม่ได้ */
  change: number | null;
  comparable: boolean;
}

export interface SssgSummary {
  rows: SssgBranchRow[]; // ทุกสาขา (รวมที่เทียบไม่ได้) เรียงตาม % เปลี่ยนแปลงมากไปน้อย
  comparable: SssgBranchRow[];
  newBranches: SssgBranchRow[]; // เดือนก่อนไม่มีวันเปิด แต่เดือนนี้มี
  closedBranches: SssgBranchRow[]; // เดือนก่อนมีวันเปิด แต่เดือนนี้ไม่มี
  /** ผลรวมยอดเฉลี่ยต่อวันของสาขาเดิม */
  current: { avgPerDay: number; avgChannel: ChannelTotals; openDays: number };
  previous: { avgPerDay: number; avgChannel: ChannelTotals; openDays: number };
  change: number | null;
  channelChange: { storefront: number | null; grab: number | null; lineman: number | null; shopee: number | null };
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

function channelOf(type: "CASH" | "CREDIT_TERM", r: SalesRowLite): ChannelTotals {
  const storefront = type === "CASH" ? (r.cashPos ?? 0) + (r.transfer ?? 0) : r.cashTransferCombined ?? 0;
  return { storefront, grab: r.grab, lineman: r.lineman, shopee: r.shopee };
}

function emptyStat(): PeriodStat {
  return { storefront: 0, grab: 0, lineman: 0, shopee: 0, total: 0, openDays: 0, avgPerDay: 0, avgChannel: { storefront: 0, grab: 0, lineman: 0, shopee: 0 } };
}

function finalize(s: PeriodStat): PeriodStat {
  if (s.openDays === 0) return s;
  s.avgPerDay = s.total / s.openDays;
  s.avgChannel = { storefront: s.storefront / s.openDays, grab: s.grab / s.openDays, lineman: s.lineman / s.openDays, shopee: s.shopee / s.openDays };
  return s;
}

/** รวมยอดต่อสาขาในช่วง โดยนับเฉพาะวันที่ยอดรวม > 0 */
function statsByBranch(branches: BranchLite[], rows: SalesRowLite[], start: Date, end: Date): Map<string, PeriodStat> {
  const typeOf = new Map(branches.map((b) => [b.id, b.type]));
  const out = new Map<string, PeriodStat>();
  for (const r of rows) {
    if (r.date < start || r.date > end) continue;
    const type = typeOf.get(r.branchId);
    if (!type) continue;
    const c = channelOf(type, r);
    const dayTotal = c.storefront + c.grab + c.lineman + c.shopee;
    if (dayTotal <= 0) continue; // วันที่ยอด 0 = ไม่ได้เปิด/ยังไม่ส่งยอด ไม่นับ
    const s = out.get(r.branchId) ?? emptyStat();
    s.storefront += c.storefront;
    s.grab += c.grab;
    s.lineman += c.lineman;
    s.shopee += c.shopee;
    s.total += dayTotal;
    s.openDays += 1;
    out.set(r.branchId, s);
  }
  for (const s of out.values()) finalize(s);
  return out;
}

export function computeSssg(
  branches: BranchLite[],
  rows: SalesRowLite[],
  current: { start: Date; end: Date },
  previous: { start: Date; end: Date }
): SssgSummary {
  const curMap = statsByBranch(branches, rows, current.start, current.end);
  const prevMap = statsByBranch(branches, rows, previous.start, previous.end);

  const all: SssgBranchRow[] = branches.map((b) => {
    const cur = curMap.get(b.id) ?? emptyStat();
    const prev = prevMap.get(b.id) ?? emptyStat();
    const comparable = cur.openDays > 0 && prev.openDays > 0;
    return { branch: b, current: cur, previous: prev, comparable, change: comparable ? pctChange(cur.avgPerDay, prev.avgPerDay) : null };
  });

  const comparable = all.filter((r) => r.comparable);
  const sum = (rowsIn: SssgBranchRow[], pick: (r: SssgBranchRow) => PeriodStat) =>
    rowsIn.reduce(
      (acc, r) => {
        const s = pick(r);
        acc.avgPerDay += s.avgPerDay;
        acc.avgChannel.storefront += s.avgChannel.storefront;
        acc.avgChannel.grab += s.avgChannel.grab;
        acc.avgChannel.lineman += s.avgChannel.lineman;
        acc.avgChannel.shopee += s.avgChannel.shopee;
        acc.openDays += s.openDays;
        return acc;
      },
      { avgPerDay: 0, avgChannel: { storefront: 0, grab: 0, lineman: 0, shopee: 0 }, openDays: 0 }
    );
  const curSum = sum(comparable, (r) => r.current);
  const prevSum = sum(comparable, (r) => r.previous);

  const byChange = (a: SssgBranchRow, b: SssgBranchRow) => {
    if (a.change === null && b.change === null) return b.current.avgPerDay - a.current.avgPerDay;
    if (a.change === null) return 1;
    if (b.change === null) return -1;
    return b.change - a.change;
  };

  return {
    rows: [...all].sort(byChange),
    comparable: [...comparable].sort(byChange),
    newBranches: all.filter((r) => r.previous.openDays === 0 && r.current.openDays > 0),
    closedBranches: all.filter((r) => r.previous.openDays > 0 && r.current.openDays === 0),
    current: curSum,
    previous: prevSum,
    change: pctChange(curSum.avgPerDay, prevSum.avgPerDay),
    channelChange: {
      storefront: pctChange(curSum.avgChannel.storefront, prevSum.avgChannel.storefront),
      grab: pctChange(curSum.avgChannel.grab, prevSum.avgChannel.grab),
      lineman: pctChange(curSum.avgChannel.lineman, prevSum.avgChannel.lineman),
      shopee: pctChange(curSum.avgChannel.shopee, prevSum.avgChannel.shopee),
    },
  };
}
