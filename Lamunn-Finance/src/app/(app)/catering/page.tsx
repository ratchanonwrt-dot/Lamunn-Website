import { Suspense } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@lamunn/db-finance";
import { requireSectionPage } from "@/lib/permissions";
import { formatBaht, formatThaiDate, paymentStatusLabel, bookingStatusLabel, pickupStatusLabel, thaiMonthLabel } from "@/lib/format";

/** วันนี้ตามเวลาไทย — เซิร์ฟเวอร์รันเป็น UTC ถ้าใช้วันที่ UTC ตรงๆ ช่วงตี 0–7 ของไทยจะยังเป็น "เมื่อวาน"
 * (เช่น เช้าวันที่ 1 จะยังนับเป็นเดือนก่อน) วันที่ในฐานข้อมูลเก็บเป็น UTC-midnight ของวันไทยอยู่แล้ว */
function bangkokToday() {
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
}

function monthParam(year: number, monthIndex0: number) {
  const d = new Date(Date.UTC(year, monthIndex0, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function CateringSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border border-gray-200 bg-white" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="h-64 rounded-xl border border-gray-200 bg-white" />
        <div className="h-64 rounded-xl border border-gray-200 bg-white" />
      </div>
    </div>
  );
}

// หัวข้อขึ้นทันที ไม่ต้องรอ query — เดิมหน้านี้ไม่มี Suspense เลย จอจึงว่างเปล่าจนกว่าจะโหลดครบทุกอย่าง
export default async function CateringDashboardPage({ searchParams }: { searchParams: { month?: string } }) {
  await requireSectionPage("CATERING");

  // เดือนที่ดู — ?month=YYYY-MM ค่าเริ่มต้นคือเดือนปัจจุบัน (เวลาไทย)
  const today = bangkokToday();
  const m = /^(\d{4})-(\d{2})$/.exec(searchParams.month ?? "");
  const year = m ? Number(m[1]) : today.getUTCFullYear();
  const monthIndex0 = m ? Math.min(11, Math.max(0, Number(m[2]) - 1)) : today.getUTCMonth();

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-gray-800">Catering Overall</h1>
      <Suspense key={`${year}-${monthIndex0}`} fallback={<CateringSkeleton />}>
        <CateringData year={year} monthIndex0={monthIndex0} />
      </Suspense>
    </div>
  );
}

async function CateringData({ year, monthIndex0 }: { year: number; monthIndex0: number }) {
  const today = bangkokToday();
  const monthStart = new Date(Date.UTC(year, monthIndex0, 1));
  const monthEnd = new Date(Date.UTC(year, monthIndex0 + 1, 0));
  const in3Days = new Date(today);
  in3Days.setUTCDate(in3Days.getUTCDate() + 3);

  const twelveMonthsAgo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1));

  const [monthBookings, futureBookingCount, paymentCounts, upcomingPickups, yearBookings, yearPickupOrders, monthPickups] = await Promise.all([
    // งานทั้งหมดของเดือนที่ดู ไม่ตัดจำนวน — นับงานหลายวันที่ "คาบเกี่ยว" เดือนนี้ด้วย (เริ่มเดือนก่อนแต่จบเดือนนี้ก็ต้องขึ้น)
    // เดิมหน้านี้โชว์แค่ 30 วันข้างหน้าและตัดไว้ 8 งาน งานที่จองไว้จึงหายจากหน้าแรกทั้งที่บันทึกแล้ว
    prisma.cateringBooking.findMany({
      where: {
        status: { not: "CANCELLED" },
        eventDate: { lte: monthEnd },
        OR: [{ eventEndDate: { gte: monthStart } }, { eventEndDate: null, eventDate: { gte: monthStart } }],
      },
      include: { customer: { select: { name: true, phone: true } }, staffAssignments: { include: { staff: { select: { name: true } } } } },
      orderBy: [{ eventDate: "asc" }, { eventStartTime: "asc" }],
    }),
    prisma.cateringBooking.count({ where: { eventDate: { gte: today }, status: { not: "CANCELLED" } } }),
    prisma.cateringBooking.groupBy({
      by: ["paymentStatus"],
      where: { status: { not: "CANCELLED" } },
      _count: { _all: true },
    }),
    prisma.pickupOrder.findMany({
      where: { pickupDate: { gte: today, lte: in3Days }, status: { in: ["PENDING", "READY"] } },
      include: { branch: true },
      orderBy: { pickupDate: "asc" },
      take: 8,
    }),
    prisma.cateringBooking.findMany({
      where: { eventDate: { gte: twelveMonthsAgo, lte: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)) }, status: { not: "CANCELLED" } },
      select: { eventDate: true, totalAmount: true },
    }),
    prisma.pickupOrder.findMany({
      where: { orderDate: { gte: twelveMonthsAgo }, status: { not: "CANCELLED" } },
      select: { orderDate: true, amount: true },
    }),
    prisma.pickupOrder.aggregate({
      where: { orderDate: { gte: monthStart, lte: monthEnd }, status: { not: "CANCELLED" } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);

  const monthLabel = thaiMonthLabel(year, monthIndex0);
  const monthTotal = monthBookings.reduce((a, b) => a + b.totalAmount, 0);
  const paymentCountMap = Object.fromEntries(paymentCounts.map((p) => [p.paymentStatus, p._count._all]));
  const prevMonth = monthParam(year, monthIndex0 - 1);
  const nextMonth = monthParam(year, monthIndex0 + 1);
  const isCurrentMonth = year === today.getUTCFullYear() && monthIndex0 === today.getUTCMonth();

  // รายได้รายเดือนย้อนหลัง 12 เดือน (จัดเลี้ยง + นัดรับหน้าร้าน) — ยุบมาจากหน้า Catering รายงานเดิม
  const monthlyRevenue = new Map<string, { bookingRevenue: number; pickupRevenue: number; date: Date }>();
  for (let i = 0; i < 12; i++) {
    const d = new Date(twelveMonthsAgo);
    d.setUTCMonth(d.getUTCMonth() + i);
    monthlyRevenue.set(monthKey(d), { bookingRevenue: 0, pickupRevenue: 0, date: d });
  }
  for (const b of yearBookings) {
    const entry = monthlyRevenue.get(monthKey(b.eventDate));
    if (entry) entry.bookingRevenue += b.totalAmount;
  }
  for (const o of yearPickupOrders) {
    const entry = monthlyRevenue.get(monthKey(o.orderDate));
    if (entry) entry.pickupRevenue += o.amount;
  }
  const monthlyRevenueRows = Array.from(monthlyRevenue.values());
  const yearTotalRevenue = monthlyRevenueRows.reduce((a, r) => a + r.bookingRevenue + r.pickupRevenue, 0);

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <Link href={`/catering?month=${prevMonth}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50" aria-label="เดือนก่อน">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <span className="min-w-[8rem] text-center text-sm font-semibold text-gray-800">{monthLabel}</span>
        <Link href={`/catering?month=${nextMonth}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50" aria-label="เดือนถัดไป">
          <ChevronRight className="h-4 w-4" />
        </Link>
        {!isCurrentMonth && (
          <Link href="/catering" className="ml-1 text-xs font-medium text-brand-600 hover:underline">
            กลับเดือนนี้
          </Link>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">การจอง {monthLabel}</p>
          <p className="mt-1 text-lg font-bold text-brand-700">{monthBookings.length} งาน</p>
          <p className="text-xs text-gray-400">{formatBaht(monthTotal)} บาท</p>
          <p className="mt-1 text-[11px] text-gray-400">งานที่จองล่วงหน้าทั้งหมด {futureBookingCount} งาน</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">ออเดอร์นัดรับ {monthLabel}</p>
          <p className="mt-1 text-lg font-bold text-emerald-700">{monthPickups._count._all} ออเดอร์</p>
          <p className="text-xs text-gray-400">{formatBaht(monthPickups._sum.amount ?? 0)} บาท</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">ยังไม่ชำระ / มัดจำแล้ว</p>
          <p className="mt-1 text-lg font-bold text-amber-600">
            {paymentCountMap.UNPAID ?? 0} / {paymentCountMap.DEPOSIT_PAID ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">ชำระครบแล้ว</p>
          <p className="mt-1 text-lg font-bold text-emerald-600">{paymentCountMap.FULLY_PAID ?? 0} งาน</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-700">
              งานจัดเลี้ยงทั้งเดือน — {monthLabel} ({monthBookings.length} งาน)
            </h2>
            <Link href="/catering/bookings/new" className="shrink-0 text-xs font-medium text-brand-600 hover:underline">
              + จองใหม่
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {monthBookings.map((b) => {
              const end = b.eventEndDate && b.eventEndDate.getTime() > b.eventDate.getTime() ? b.eventEndDate : b.eventDate;
              const isPast = end < today;
              const isToday = b.eventDate <= today && end >= today;
              return (
                <Link
                  key={b.id}
                  href={`/catering/bookings/${b.id}`}
                  className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-gray-100 ${isToday ? "bg-brand-50 ring-1 ring-brand-200" : "bg-gray-50"} ${isPast ? "opacity-60" : ""}`}
                >
                  <div>
                    <p className="font-medium text-gray-800">
                      {b.customer.name}
                      {isToday && <span className="ml-2 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-medium text-white">วันนี้</span>}
                      {isPast && <span className="ml-2 text-[11px] font-normal text-gray-400">(ผ่านไปแล้ว)</span>}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatThaiDate(b.eventDate)}
                      {end.getTime() > b.eventDate.getTime() ? ` – ${formatThaiDate(end)}` : ""}
                      {b.eventStartTime ? ` · ${b.eventStartTime}${b.eventEndTime ? `–${b.eventEndTime}` : ""} น.` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {b.guestCount != null ? `${b.guestCount} เสิร์ฟ` : "ไม่ระบุจำนวนเสิร์ฟ"}
                      {" · "}
                      {b.needsBooth ? "มีบูธ" : "ไม่มีบูธ"}
                      {" · "}
                      {b.location || "ไม่ระบุสถานที่"}
                    </p>
                    <p className="mt-0.5 text-xs">
                      {b.staffAssignments.length > 0 ? (
                        <span className="text-brand-600">
                          {b.staffAssignments.length} คน: {b.staffAssignments.map((a) => a.staffName ?? a.staff?.name).join(", ")}
                        </span>
                      ) : (
                        <span className={isPast ? "text-gray-400" : "text-red-500"}>ยังไม่ได้จัดคน</span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                    <span className="font-medium text-gray-700">{formatBaht(b.totalAmount)}</span>
                    <span className="text-gray-500">{paymentStatusLabel[b.paymentStatus]}</span>
                    <span className="text-gray-400">{bookingStatusLabel[b.status]}</span>
                  </div>
                </Link>
              );
            })}
            {monthBookings.length === 0 && <p className="text-sm text-gray-400">ไม่มีงานจัดเลี้ยงใน{monthLabel}</p>}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">ออเดอร์นัดรับใกล้ถึง (3 วันข้างหน้า)</h2>
          <div className="flex flex-col gap-2">
            {upcomingPickups.map((o) => (
              <Link key={o.id} href={`/catering/pickup-orders/${o.id}`} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm hover:bg-gray-100">
                <div>
                  <p className="font-medium text-gray-800">{o.customerName}</p>
                  <p className="text-xs text-gray-400">
                    {formatThaiDate(o.pickupDate)}
                    {o.pickupTime ? ` · ${o.pickupTime} น.` : ""}
                    {o.branch ? ` · ${o.branch.name}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={
                      o.paymentStatus === "FULLY_PAID"
                        ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
                        : o.paymentStatus === "DEPOSIT_PAID"
                        ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                        : "rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500"
                    }
                  >
                    {paymentStatusLabel[o.paymentStatus]}
                  </span>
                  <span className="text-xs text-gray-400">{pickupStatusLabel[o.status]}</span>
                </div>
              </Link>
            ))}
            {upcomingPickups.length === 0 && <p className="text-sm text-gray-400">ไม่มีออเดอร์ในช่วงนี้</p>}
          </div>
        </div>
      </div>

      <details className="group mt-6 rounded-xl border border-gray-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 [&::-webkit-details-marker]:hidden">
          <span>
            รายได้รายเดือน (จัดเลี้ยง + นัดรับหน้าร้าน) — ย้อนหลัง 12 เดือน{" "}
            <span className="font-normal text-gray-400">รวม {formatBaht(yearTotalRevenue)} บาท</span>
          </span>
          <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="overflow-x-auto border-t border-gray-100 p-4">
          <table className="w-full min-w-[500px] text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="px-3 py-1.5">เดือน</th>
                <th className="px-3 py-1.5">จัดเลี้ยง</th>
                <th className="px-3 py-1.5">นัดรับหน้าร้าน</th>
                <th className="px-3 py-1.5">รวม</th>
              </tr>
            </thead>
            <tbody>
              {monthlyRevenueRows.map((r) => (
                <tr key={monthKey(r.date)} className="border-t border-gray-100">
                  <td className="px-3 py-1.5 text-gray-700">{thaiMonthLabel(r.date.getUTCFullYear(), r.date.getUTCMonth())}</td>
                  <td className="px-3 py-1.5 text-gray-600">{formatBaht(r.bookingRevenue)}</td>
                  <td className="px-3 py-1.5 text-gray-600">{formatBaht(r.pickupRevenue)}</td>
                  <td className="px-3 py-1.5 font-medium text-gray-800">{formatBaht(r.bookingRevenue + r.pickupRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
