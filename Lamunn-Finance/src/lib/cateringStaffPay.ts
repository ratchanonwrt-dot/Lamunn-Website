/** คิด OT พนักงาน Catering สิ้นเดือน
 *
 * ชั่วโมงของการไปงาน 1 ครั้ง:
 *   - ถ้ากรอก "ชั่วโมง OT" ไว้ในงานนั้น (CateringBookingStaff.otHours) ใช้ค่านั้นเป็นชั่วโมงรวมของทั้งงาน
 *   - ไม่งั้นคิดจากเวลาเริ่ม-จบของงาน × จำนวนวันที่จัด (งานข้ามเที่ยงคืนนับต่อได้)
 * งานหลายวันที่คร่อมเดือน แบ่งชั่วโมงเฉลี่ยต่อวัน แล้วนับเฉพาะวันที่อยู่ในเดือนที่ดู
 * วันที่ตรงกับ "วันหยุดประจำสัปดาห์" ของคนนั้นใช้อัตราวันหยุด (ถ้าไม่ได้ตั้ง ใช้อัตราปกติ)
 *
 * ค่ารถ + ค่าข้าว (สรุปเป็นรอบ 1–15 / 16–สิ้นเดือน):
 *   - ค่ารถ = ยอดที่ให้ล่วงหน้าต่อการไปงาน 1 ครั้ง (CateringBookingStaff.travelCost) นับครั้งเดียวที่วันแรกของงาน
 *     งานหลายวันที่คร่อมรอบจะไม่ถูกนับค่ารถซ้ำสองรอบ
 *   - ค่าข้าว = MEAL_ALLOWANCE บาทต่อวันที่ทำงานเกิน MEAL_MIN_HOURS ชั่วโมง (ใช้ชั่วโมงต่อวันชุดเดียวกับ OT)
 *
 * ไฟล์นี้ไม่ import prisma — ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และ client (เช่น โชว์ชั่วโมงตั้งต้นในหน้างาน) */

export const DOW_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

export const MEAL_ALLOWANCE = 50;
export const MEAL_MIN_HOURS = 4;

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
  staffAssignments: { staffName: string | null; staff: { name: string } | null; otHours: number | null; travelCost: number | null }[];
}

export interface StaffJobLine {
  bookingId: string;
  customer: string;
  dates: string[]; // YYYY-MM-DD ในช่วงที่ดู
  dayOffDates: string[];
  mealDates: string[]; // วันที่ทำงานเกิน MEAL_MIN_HOURS ชม. → ได้ค่าข้าว
  hoursPerDay: number;
  normalHours: number;
  dayOffHours: number;
  hoursMissing: boolean; // ไม่มีเวลางานและไม่ได้กรอกชั่วโมงเอง → นับเป็น 0 ชม. (ไม่ได้ค่าข้าวด้วย)
  pay: number;
  travel: number; // 0 ถ้าวันแรกของงานไม่อยู่ในช่วงที่ดู
  meal: number;
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
  travel: number;
  mealDays: number;
  meal: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

const emptyRow = (name: string, staff: RosterStaff | null): StaffMonthPay => ({
  name,
  staff,
  jobs: [],
  jobCount: 0,
  dayCount: 0,
  dayOffDayCount: 0,
  normalHours: 0,
  dayOffHours: 0,
  pay: 0,
  travel: 0,
  mealDays: 0,
  meal: 0,
});

export function computeMonthPay(roster: RosterStaff[], bookings: PayBooking[], year: number, monthIndex0: number): StaffMonthPay[] {
  return computePeriodPay(roster, bookings, new Date(Date.UTC(year, monthIndex0, 1)), new Date(Date.UTC(year, monthIndex0 + 1, 0)));
}

/** รอบจ่ายค่ารถ/ค่าข้าว: รอบ 1 = วันที่ 1–15, รอบ 2 = 16–สิ้นเดือน */
export function halfMonthBounds(year: number, monthIndex0: number, round: 1 | 2) {
  return round === 1
    ? { start: new Date(Date.UTC(year, monthIndex0, 1)), end: new Date(Date.UTC(year, monthIndex0, 15)) }
    : { start: new Date(Date.UTC(year, monthIndex0, 16)), end: new Date(Date.UTC(year, monthIndex0 + 1, 0)) };
}

/** คิด OT + ค่ารถ + ค่าข้าว ของทุกคนในช่วงวันที่ start..end (รวมทั้งสองวัน, UTC-midnight ของวันไทย) */
export function computePeriodPay(roster: RosterStaff[], bookings: PayBooking[], start: Date, end: Date): StaffMonthPay[] {
  const byKey = new Map<string, StaffMonthPay>();
  for (const s of roster) {
    byKey.set(s.name.trim().toLowerCase(), emptyRow(s.name, s));
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
        row = emptyRow(name, null);
        byKey.set(key, row);
      }
      const offs = new Set(parseDayOffs(row.staff?.dayOffs));
      const perDay = a.otHours != null ? a.otHours / allDays.length : perDayDefault ?? 0;
      const rate = row.staff?.otRatePerHour ?? 0;
      const offRate = row.staff?.dayOffRatePerHour ?? rate;

      const line: StaffJobLine = {
        bookingId: b.id,
        customer: b.customer.name,
        dates: [],
        dayOffDates: [],
        mealDates: [],
        hoursPerDay: r2(perDay),
        normalHours: 0,
        dayOffHours: 0,
        hoursMissing: a.otHours == null && perDayDefault === null,
        pay: 0,
        travel: allDays[0] >= start ? a.travelCost ?? 0 : 0,
        meal: 0,
      };
      for (const d of inMonth) {
        const iso = d.toISOString().slice(0, 10);
        line.dates.push(iso);
        if (perDay > MEAL_MIN_HOURS) line.mealDates.push(iso);
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
      line.meal = line.mealDates.length * MEAL_ALLOWANCE;

      row.jobs.push(line);
      row.jobCount += 1;
      row.dayCount += line.dates.length;
      row.dayOffDayCount += line.dayOffDates.length;
      row.normalHours = r2(row.normalHours + line.normalHours);
      row.dayOffHours = r2(row.dayOffHours + line.dayOffHours);
      row.pay = r2(row.pay + line.pay);
      row.travel = r2(row.travel + line.travel);
      row.mealDays += line.mealDates.length;
      row.meal += line.meal;
    }
  }

  return [...byKey.values()]
    .filter((r) => r.jobCount > 0 || r.staff?.isActive)
    .sort((a, b) => b.jobCount - a.jobCount || b.pay - a.pay || a.name.localeCompare(b.name, "th"));
}
