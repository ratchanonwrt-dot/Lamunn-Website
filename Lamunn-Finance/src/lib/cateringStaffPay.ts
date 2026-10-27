/** คิด OT พนักงาน Catering สิ้นเดือน
 *
 * ชั่วโมงของการไปงาน 1 ครั้ง:
 *   - ถ้ากรอก "ชั่วโมง OT" ไว้ในงานนั้น (CateringBookingStaff.otHours) ใช้ค่านั้นเป็นชั่วโมงรวมของทั้งงาน
 *   - ไม่งั้นคิดจากเวลาเริ่ม-จบของงาน × จำนวนวันที่จัด (งานข้ามเที่ยงคืนนับต่อได้)
 * งานหลายวันที่คร่อมเดือน แบ่งชั่วโมงเฉลี่ยต่อวัน แล้วนับเฉพาะวันที่อยู่ในเดือนที่ดู
 * วันที่ตรงกับ "วันหยุดประจำสัปดาห์" ของคนนั้นใช้อัตราวันหยุด (ถ้าไม่ได้ตั้ง ใช้อัตราปกติ)
 *
 * ไฟล์นี้ไม่ import prisma — ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และ client (เช่น โชว์ชั่วโมงตั้งต้นในหน้างาน) */

export const DOW_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

export function parseDayOffs(s: string | null | undefined): number[] {
  return (s ?? "")
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

function minutesOf(t: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? "");
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** ชั่วโมงต่อวันจากเวลางาน — null ถ้าไม่ได้กรอกเวลาเริ่มหรือจบ */
export function hoursPerDay(start: string | null | undefined, end: string | null | undefined): number | null {
  const a = minutesOf(start);
  const b = minutesOf(end);
  if (a === null || b === null) return null;
  const diff = b > a ? b - a : b + 24 * 60 - a;
  return Math.round((diff / 60) * 100) / 100;
}

export function eventDays(eventDate: Date, eventEndDate: Date | null): Date[] {
  const last = eventEndDate && eventEndDate > eventDate ? eventEndDate : eventDate;
  const out: Date[] = [];
  for (let d = new Date(eventDate); d <= last; d = new Date(d.getTime() + 86400000)) out.push(d);
  return out;
}

/** ชั่วโมงตั้งต้นของการไปงานครั้งนี้ (ทั้งงาน) — ใช้เป็นค่าที่โชว์ในช่องถ้ายังไม่ได้กรอกเอง */
export function defaultAssignmentHours(b: { eventDate: Date; eventEndDate: Date | null; eventStartTime: string | null; eventEndTime: string | null }): number | null {
  const h = hoursPerDay(b.eventStartTime, b.eventEndTime);
  return h === null ? null : Math.round(h * eventDays(b.eventDate, b.eventEndDate).length * 100) / 100;
}

export interface RosterStaff {
  id: string;
  name: string;
  dayOffs: string;
  otRatePerHour: number;
  dayOffRatePerHour: number | null;
  isActive: boolean;
}

export interface PayBooking {
  id: string;
  eventDate: Date;
  eventEndDate: Date | null;
  eventStartTime: string | null;
  eventEndTime: string | null;
  status: string;
  customer: { name: string };
  staffAssignments: { staffName: string | null; staff: { name: string } | null; otHours: number | null }[];
}

export interface StaffJobLine {
  bookingId: string;
  customer: string;
  dates: string[]; // YYYY-MM-DD ในเดือนที่ดู
  dayOffDates: string[];
  normalHours: number;
  dayOffHours: number;
  hoursMissing: boolean; // ไม่มีเวลางานและไม่ได้กรอกชั่วโมงเอง → นับเป็น 0 ชม.
  pay: number;
}

export interface StaffMonthPay {
  name: string;
  staff: RosterStaff | null; // null = ชื่อที่ถูกจัดไปงานแต่ยังไม่อยู่ในรายชื่อ
  jobs: StaffJobLine[];
  jobCount: number;
  dayCount: number;
  dayOffDayCount: number;
  normalHours: number;
  dayOffHours: number;
  pay: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeMonthPay(roster: RosterStaff[], bookings: PayBooking[], year: number, monthIndex0: number): StaffMonthPay[] {
  const start = new Date(Date.UTC(year, monthIndex0, 1));
  const end = new Date(Date.UTC(year, monthIndex0 + 1, 0));
  const byKey = new Map<string, StaffMonthPay>();
  for (const s of roster) {
    byKey.set(s.name.trim().toLowerCase(), { name: s.name, staff: s, jobs: [], jobCount: 0, dayCount: 0, dayOffDayCount: 0, normalHours: 0, dayOffHours: 0, pay: 0 });
  }

  for (const b of bookings) {
    if (b.status === "CANCELLED") continue;
    const allDays = eventDays(b.eventDate, b.eventEndDate);
    const inMonth = allDays.filter((d) => d >= start && d <= end);
    if (inMonth.length === 0) continue;
    const perDayDefault = hoursPerDay(b.eventStartTime, b.eventEndTime);
    const seen = new Set<string>();

    for (const a of b.staffAssignments) {
      const name = (a.staffName ?? a.staff?.name ?? "").trim();
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);

      let row = byKey.get(key);
      if (!row) {
        row = { name, staff: null, jobs: [], jobCount: 0, dayCount: 0, dayOffDayCount: 0, normalHours: 0, dayOffHours: 0, pay: 0 };
        byKey.set(key, row);
      }
      const offs = new Set(parseDayOffs(row.staff?.dayOffs));
      const perDay = a.otHours != null ? a.otHours / allDays.length : perDayDefault ?? 0;
      const rate = row.staff?.otRatePerHour ?? 0;
      const offRate = row.staff?.dayOffRatePerHour ?? rate;

      const line: StaffJobLine = { bookingId: b.id, customer: b.customer.name, dates: [], dayOffDates: [], normalHours: 0, dayOffHours: 0, hoursMissing: a.otHours == null && perDayDefault === null, pay: 0 };
      for (const d of inMonth) {
        const iso = d.toISOString().slice(0, 10);
        line.dates.push(iso);
        if (offs.has(d.getUTCDay())) {
          line.dayOffDates.push(iso);
          line.dayOffHours += perDay;
        } else {
          line.normalHours += perDay;
        }
      }
      line.normalHours = r2(line.normalHours);
      line.dayOffHours = r2(line.dayOffHours);
      line.pay = r2(line.normalHours * rate + line.dayOffHours * offRate);

      row.jobs.push(line);
      row.jobCount += 1;
      row.dayCount += line.dates.length;
      row.dayOffDayCount += line.dayOffDates.length;
      row.normalHours = r2(row.normalHours + line.normalHours);
      row.dayOffHours = r2(row.dayOffHours + line.dayOffHours);
      row.pay = r2(row.pay + line.pay);
    }
  }

  return [...byKey.values()]
    .filter((r) => r.jobCount > 0 || r.staff?.isActive)
    .sort((a, b) => b.jobCount - a.jobCount || b.pay - a.pay || a.name.localeCompare(b.name, "th"));
}
