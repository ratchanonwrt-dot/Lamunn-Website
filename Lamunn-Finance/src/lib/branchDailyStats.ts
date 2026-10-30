import type { BranchLite, SalesRowLite } from "./reportsCalc";

/** สถิติยอดขายรายวันของแต่ละสาขาในช่วงที่เลือก — ใช้ในหมวด "วิเคราะห์ยอดรายสาขา" ของหน้ารายงาน
 *
 * ยอดต่อวัน = หน้าร้าน + Grab + Lineman (สูตรเดียวกับทุกรายงาน: สาขาเงินสด = เงินสด+เงินโอน, Credit Term = ช่องรวม)
 * นับเฉพาะ "วันที่เปิดจริง" (ยอดรวม > 0) — วันที่ยอดเป็น 0 คือไม่ได้เปิดหรือยังไม่ส่งยอดใน IMS ถ้าเอามาหารด้วย
 * ค่าเฉลี่ยจะต่ำเกินจริง (หลักเดียวกับหน้า SSSG)
 * วันธรรมดา/เสาร์-อาทิตย์ดูจากวันในสัปดาห์ของวันที่ไทย — วันที่ในฐานข้อมูลเก็บเป็น UTC-midnight ของวันไทย จึงใช้ getUTCDay ได้ตรง */

export interface DayGroupStat {
  days: number;
  total: number;
  avg: number; // 0 ถ้าไม่มีวันเปิด
}

export interface BranchDailyStat {
  branch: BranchLite;
  all: DayGroupStat;
  weekday: DayGroupStat;
  weekend: DayGroupStat;
  /** วันที่เปิดแต่ยอดต่ำกว่าเกณฑ์ (YYYY-MM-DD เรียงตามวันที่) */
  lowDates: string[];
  /** เสาร์-อาทิตย์เทียบวันธรรมดา (null ถ้ากลุ่มใดไม่มีวันเปิด) */
  weekendLift: number | null;
}

function emptyGroup(): DayGroupStat {
  return { days: 0, total: 0, avg: 0 };
}

function add(g: DayGroupStat, amount: number) {
  g.days += 1;
  g.total += amount;
}

function finish(g: DayGroupStat) {
  g.avg = g.days > 0 ? g.total / g.days : 0;
}

export function computeBranchDailyStats(
  branches: BranchLite[],
  rows: SalesRowLite[],
  from: Date,
  to: Date,
  lowThreshold: number
): BranchDailyStat[] {
  const typeOf = new Map(branches.map((b) => [b.id, b.type]));
  const byBranch = new Map<string, { all: DayGroupStat; weekday: DayGroupStat; weekend: DayGroupStat; lowDates: string[] }>();

  for (const r of rows) {
    if (r.date < from || r.date > to) continue;
    const type = typeOf.get(r.branchId);
    if (!type) continue;
    const storefront = type === "CASH" ? (r.cashPos ?? 0) + (r.transfer ?? 0) : r.cashTransferCombined ?? 0;
    const dayTotal = storefront + r.grab + r.lineman + r.shopee;
    if (dayTotal <= 0) continue;

    let s = byBranch.get(r.branchId);
    if (!s) {
      s = { all: emptyGroup(), weekday: emptyGroup(), weekend: emptyGroup(), lowDates: [] };
      byBranch.set(r.branchId, s);
    }
    add(s.all, dayTotal);
    const dow = r.date.getUTCDay();
    add(dow === 0 || dow === 6 ? s.weekend : s.weekday, dayTotal);
    if (dayTotal < lowThreshold) s.lowDates.push(r.date.toISOString().slice(0, 10));
  }

  const out: BranchDailyStat[] = [];
  for (const b of branches) {
    const s = byBranch.get(b.id);
    if (!s) continue; // ไม่มีวันเปิดเลยในช่วงนี้ — ไม่แสดง
    finish(s.all);
    finish(s.weekday);
    finish(s.weekend);
    s.lowDates.sort();
    const weekendLift = s.weekday.days > 0 && s.weekend.days > 0 ? (s.weekend.avg - s.weekday.avg) / s.weekday.avg : null;
    out.push({ branch: b, ...s, weekendLift });
  }
  return out;
}
