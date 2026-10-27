import { NextRequest, NextResponse } from "next/server";
import { requireSectionApi } from "@/lib/permissions";
import { getCateringCapacity, jobsPerDay, loadMonthBookings } from "@/lib/cateringCalendar";

/** จำนวนงานต่อวันของเดือน — ฟอร์มลงงานใหม่ใช้บอกพนักงานทันทีที่เลือกวันว่า "วันนี้ยังรับงานได้ไหม" */
export async function GET(req: NextRequest) {
  const staff = await requireSectionApi("CATERING", "view");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const m = /^(\d{4})-(\d{2})$/.exec(req.nextUrl.searchParams.get("month") ?? "");
  if (!m) return NextResponse.json({ error: "month=YYYY-MM is required" }, { status: 400 });
  const year = Number(m[1]);
  const monthIndex0 = Number(m[2]) - 1;

  const [capacity, bookings] = await Promise.all([getCateringCapacity(), loadMonthBookings(year, monthIndex0)]);
  const perDay = jobsPerDay(bookings, year, monthIndex0);
  const days: Record<string, { count: number; names: string[] }> = {};
  for (const [day, list] of perDay) days[day] = { count: list.length, names: list.map((b) => b.customer.name) };

  return NextResponse.json({ capacity, days });
}
