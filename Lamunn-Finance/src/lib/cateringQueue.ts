/** คิวงาน Catering แบบเท่าเทียม — ใครไปกี่งานในเดือนนี้ และงานต่อไปควรเป็นคิวใคร
 *
 * หลักการ: คนที่ไปงานน้อยที่สุดในเดือนได้คิวก่อน (เท่ากันดูจำนวนวันทำงาน แล้วดูว่าใครไปงานล่าสุดนานที่สุด)
 * คนที่ติดงานอื่นวันเดียวกัน หรือเป็นวันหยุดประจำสัปดาห์ จะถูกข้ามไปคนถัดไป แต่ยังโชว์พร้อมเหตุผล
 *
 * ไฟล์นี้ไม่ import prisma — เป็นฟังก์ชันล้วน ทดสอบได้ด้วยข้อมูลจำลอง */

export interface QueueRosterStaff {
  name: string;
  dayOffs: string; // "0,6" = อา, ส
  isActive: boolean;
}

export interface QueueBooking {
  id: string;
  customer: string;
  eventDate: Date;
  eventEndDate: Date | null;
  status: string;
  /** ชื่อคนที่ถูกจัดไปแล้ว */
  staffNames: string[];
  /** จำนวนคนที่ต้องใช้ตามกฎ 75 เสิร์ฟ/คน */
  required: number;
}

export interface QueueDuty {
  staffName: string;
  date: Date;
}

export interface QueueRow {
  name: string;
  inRoster: boolean;
  jobs: number; // งาน (นับ 1 ต่อ 1 งาน แม้จัดหลายวัน)
  days: number; // วันทำงานของงานจัดเลี้ยงในเดือนนี้
  dutyDays: number; // วันสอน/แทนสาขา (โชว์ประกอบ ไม่นับในความเท่าเทียมของงานจัดเลี้ยง)
  lastJobAt: Date | null;
}

export interface QueueSuggestion {
  name: string;
  skipped: null | "busy" | "dayOff";
}

export interface NextJob {
  booking: QueueBooking;
  missing: number; // ขาดอีกกี่คน
  suggestions: QueueSuggestion[]; // เรียงตามคิว คนที่ไม่ถูกข้ามอยู่บนสุด
  picks: string[]; // ชื่อที่ควรเลือก (ตามจำนวนที่ขาด)
}

export interface QueueResult {
  rows: QueueRow[]; // เรียงตามคิว (คนถัดไปอยู่บนสุด)
  maxJobs: number;
  minJobs: number;
  spread: number;
  fair: boolean; // ต่างกันไม่เกิน 1 งาน (จำนวนงานเป็นจำนวนเต็ม ทำให้เท่ากันเป๊ะไม่ได้เสมอ)
  nextJob: NextJob | null;
}

const key = (s: string) => s.trim().toLowerCase();
const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

function lastDayOf(b: { eventDate: Date; eventEndDate: Date | null }) {
  return b.eventEndDate && b.eventEndDate > b.eventDate ? b.eventEndDate : b.eventDate;
}

function daysOf(b: { eventDate: Date; eventEndDate: Date | null }): Date[] {
  const out: Date[] = [];
  for (let d = new Date(b.eventDate); d <= lastDayOf(b); d = new Date(d.getTime() + DAY)) out.push(d);
  return out;
}

function parseOffs(s: string): number[] {
  return s
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

/** monthStart..monthEnd = ขอบเขตของเดือนที่ดู (UTC-midnight ของวันไทย); today = วันนี้ (ใช้หางานถัดไป) */
export function buildQueue(opts: {
  roster: QueueRosterStaff[];
  bookings: QueueBooking[]; // งานที่ทับกับเดือนนี้ (ไม่รวมยกเลิก)
  duties: QueueDuty[]; // สอน/แทนสาขาในเดือนนี้
  monthStart: Date;
  monthEnd: Date;
  today: Date;
}): QueueResult {
  const { roster, bookings, duties, monthStart, monthEnd, today } = opts;
  const inMonth = (d: Date) => d >= monthStart && d <= monthEnd;

  const rows = new Map<string, QueueRow>();
  for (const r of roster) {
    if (r.isActive) rows.set(key(r.name), { name: r.name, inRoster: true, jobs: 0, days: 0, dutyDays: 0, lastJobAt: null });
  }

  for (const b of bookings) {
    if (b.status === "CANCELLED") continue;
    const monthDays = daysOf(b).filter(inMonth);
    if (monthDays.length === 0) continue;
    for (const n of new Set(b.staffNames.map(key))) {
      if (!n) continue;
      let row = rows.get(n);
      if (!row) {
        // ชื่อที่ถูกจัดไปงานแต่ไม่อยู่ในรายชื่อ (หรือถูกปิดใช้งานแล้ว) — ยังนับงานให้ แต่ไม่ถูกเสนอเป็นคิวถัดไป
        const original = b.staffNames.find((x) => key(x) === n)!.trim();
        const rosterHit = roster.find((r) => key(r.name) === n);
        row = { name: rosterHit?.name ?? original, inRoster: !!rosterHit, jobs: 0, days: 0, dutyDays: 0, lastJobAt: null };
        rows.set(n, row);
      }
      row.jobs += 1;
      row.days += monthDays.length;
      const last = monthDays[monthDays.length - 1];
      if (!row.lastJobAt || last > row.lastJobAt) row.lastJobAt = last;
    }
  }

  for (const d of duties) {
    if (!inMonth(d.date)) continue;
    const row = rows.get(key(d.staffName));
    if (row) row.dutyDays += 1;
  }

  const order = (a: QueueRow, b: QueueRow) =>
    a.jobs - b.jobs ||
    a.days - b.days ||
    (a.lastJobAt?.getTime() ?? -Infinity) - (b.lastJobAt?.getTime() ?? -Infinity) ||
    a.name.localeCompare(b.name, "th");
  const list = [...rows.values()].sort(order);

  const eligible = list.filter((r) => r.inRoster);
  const counts = eligible.map((r) => r.jobs);
  const maxJobs = counts.length ? Math.max(...counts) : 0;
  const minJobs = counts.length ? Math.min(...counts) : 0;
  const spread = maxJobs - minJobs;

  // งานถัดไป = งานที่เร็วที่สุดตั้งแต่วันนี้ (หรือต้นเดือนที่กำลังดู) ที่ยังจัดคนไม่ครบ
  const from = today > monthStart ? today : monthStart;
  const upcoming = bookings
    .filter((b) => b.status !== "CANCELLED" && b.status !== "COMPLETED" && lastDayOf(b) >= from && b.staffNames.length < b.required)
    .sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime())[0];

  let nextJob: NextJob | null = null;
  if (upcoming) {
    const jobDays = daysOf(upcoming);
    const already = new Set(upcoming.staffNames.map(key));
    const suggestions: QueueSuggestion[] = [];
    for (const r of eligible) {
      if (already.has(key(r.name))) continue;
      const offs = parseOffs(roster.find((x) => key(x.name) === key(r.name))?.dayOffs ?? "");
      const busy = bookings.some(
        (o) => o.id !== upcoming.id && o.status !== "CANCELLED" && o.staffNames.some((n) => key(n) === key(r.name)) && daysOf(o).some((od) => jobDays.some((jd) => iso(jd) === iso(od)))
      );
      const dayOff = jobDays.some((jd) => offs.includes(jd.getUTCDay()));
      suggestions.push({ name: r.name, skipped: busy ? "busy" : dayOff ? "dayOff" : null });
    }
    suggestions.sort((a, b) => Number(a.skipped !== null) - Number(b.skipped !== null)); // sort เสถียร: คงลำดับคิวไว้ในแต่ละกลุ่ม
    const missing = upcoming.required - upcoming.staffNames.length;
    nextJob = { booking: upcoming, missing, suggestions, picks: suggestions.filter((s) => !s.skipped).slice(0, missing).map((s) => s.name) };
  }

  return { rows: list, maxJobs, minJobs, spread, fair: spread <= 1, nextJob };
}
