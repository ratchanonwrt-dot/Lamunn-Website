import { prisma } from "@lamunn/db-finance";

/** ข้อมูลปฏิทินงาน Catering รายเดือน — ใช้ทั้งหน้าปฏิทิน, คำใบ้ "วันนี้ยังรับงานได้ไหม" ในฟอร์มจอง และสรุปรายพนักงาน
 *
 * งานหลายวัน (eventDate..eventEndDate) นับเป็น "งาน" ในทุกวันที่จัด เพราะทีมต้องไปทุกวัน
 * งานที่ยกเลิกไม่นับ ไม่กินที่ในปฏิทิน */

export const CAPACITY_SETTING_KEY = "cateringMaxJobsPerDay";

/** กฎบริษัท (ล็อคไว้ ไม่ให้แก้จากหน้าเว็บ): ทุก 75 เสิร์ฟต้องมีพนักงาน 1 คน — 1–75 = 1 คน, 76–150 = 2 คน ... */
export const SERVINGS_PER_STAFF = 75;

export function requiredStaff(servings: number | null | undefined): number {
  const n = Number(servings);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.ceil(n / SERVINGS_PER_STAFF);
}

/** จำนวนเสิร์ฟที่ใช้คิดคน — งานหลายวันใช้วันที่เสิร์ฟมากที่สุด เพราะต้องมีคนพอสำหรับวันที่หนักสุด */
export function bookingServings(b: { guestCount: number | null; days?: { servings: number | null }[] }): number | null {
  const dayMax = Math.max(0, ...(b.days ?? []).map((d) => d.servings ?? 0));
  const n = Math.max(b.guestCount ?? 0, dayMax);
  return n > 0 ? n : null;
}
export const DEFAULT_CAPACITY = 2;

export async function getCateringCapacity(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: CAPACITY_SETTING_KEY } });
  const n = Number(row?.value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_CAPACITY;
}

export function monthBounds(year: number, monthIndex0: number) {
  return { start: new Date(Date.UTC(year, monthIndex0, 1)), end: new Date(Date.UTC(year, monthIndex0 + 1, 0)) };
}

/** วันนี้ตามเวลาไทย (UTC-midnight ของวันไทย ให้เทียบกับวันที่ในฐานข้อมูลได้ตรง) */
export function bangkokToday() {
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function loadMonthBookings(year: number, monthIndex0: number) {
  const { start, end } = monthBounds(year, monthIndex0);
  return prisma.cateringBooking.findMany({
    where: {
      status: { not: "CANCELLED" },
      eventDate: { lte: end },
      OR: [{ eventEndDate: { gte: start } }, { eventEndDate: null, eventDate: { gte: start } }],
    },
    include: {
      customer: { select: { name: true, phone: true, source: true } },
      staffAssignments: { include: { staff: { select: { name: true } } } },
      days: { select: { servings: true } },
    },
    orderBy: [{ eventDate: "asc" }, { eventStartTime: "asc" }],
  });
}

export type MonthBooking = Awaited<ReturnType<typeof loadMonthBookings>>[number];

/** วันทั้งหมดที่งานนี้จัด (YYYY-MM-DD) ตัดเฉพาะที่อยู่ในเดือนที่ดู */
export function bookingDaysInMonth(b: { eventDate: Date; eventEndDate: Date | null }, year: number, monthIndex0: number): string[] {
  const { start, end } = monthBounds(year, monthIndex0);
  const last = b.eventEndDate && b.eventEndDate > b.eventDate ? b.eventEndDate : b.eventDate;
  const out: string[] = [];
  for (let d = new Date(b.eventDate); d <= last; d = new Date(d.getTime() + 86400000)) {
    if (d >= start && d <= end) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function staffNamesOf(b: { staffAssignments: { staffName: string | null; staff: { name: string } | null }[] }): string[] {
  return b.staffAssignments.map((a) => (a.staffName ?? a.staff?.name ?? "").trim()).filter(Boolean);
}

/** จำนวนงานต่อวันของเดือน (key = YYYY-MM-DD) */
export function jobsPerDay(bookings: MonthBooking[], year: number, monthIndex0: number) {
  const map = new Map<string, MonthBooking[]>();
  for (const b of bookings) {
    for (const day of bookingDaysInMonth(b, year, monthIndex0)) {
      const arr = map.get(day) ?? [];
      arr.push(b);
      map.set(day, arr);
    }
  }
  return map;
}

/** สรุปรายพนักงาน: ใครไปงานวันไหนบ้าง รวมกี่งาน / กี่วัน */
export function staffSummary(bookings: MonthBooking[], year: number, monthIndex0: number) {
  const map = new Map<string, { name: string; bookings: { id: string; customer: string; days: string[] }[]; dayCount: number }>();
  for (const b of bookings) {
    const days = bookingDaysInMonth(b, year, monthIndex0);
    for (const name of new Set(staffNamesOf(b))) {
      const key = name.toLowerCase();
      const row = map.get(key) ?? { name, bookings: [], dayCount: 0 };
      row.bookings.push({ id: b.id, customer: b.customer.name, days });
      row.dayCount += days.length;
      map.set(key, row);
    }
  }
  return [...map.values()].sort((a, b) => b.bookings.length - a.bookings.length || b.dayCount - a.dayCount || a.name.localeCompare(b.name, "th"));
}

/** รายชื่อพนักงานที่เคยถูกจัดไปงาน (ไม่ซ้ำ) เรียงจากใช้บ่อยสุด — ใช้เป็นตัวเลือกกดเพิ่มได้เลยไม่ต้องพิมพ์ซ้ำ */
export async function knownCateringStaffNames(): Promise<string[]> {
  const rows = await prisma.cateringBookingStaff.findMany({ select: { staffName: true, staff: { select: { name: true } } } });
  const count = new Map<string, { name: string; n: number }>();
  for (const r of rows) {
    const name = (r.staffName ?? r.staff?.name ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const cur = count.get(key) ?? { name, n: 0 };
    cur.n += 1;
    count.set(key, cur);
  }
  return [...count.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "th")).map((x) => x.name);
}
