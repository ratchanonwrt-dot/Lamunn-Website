import { Suspense } from "react";
import Link from "next/link";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { prisma } from "@lamunn/db-finance";
import { requireSectionPage } from "@/lib/permissions";
import { formatBaht, formatThaiDate, pickupStatusLabel, thaiMonthLabel } from "@/lib/format";
import { bangkokToday, bookingServings, loadMonthBookings, requiredStaff, staffNamesOf } from "@/lib/cateringCalendar";
import { bookingTone } from "@/lib/cateringStatus";
import BookingCard from "@/components/catering/BookingCard";
import CateringHeader, { headerBtn } from "@/components/catering/CateringHeader";

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
      <div className="mb-5 h-40 rounded-2xl bg-gray-800" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-white" />
        ))}
      </div>
    </div>
  );
}

export default async function CateringDashboardPage({ searchParams }: { searchParams: { month?: string } }) {
  const me = await requireSectionPage("CATERING");
  const today = bangkokToday();
  const m = /^(\d{4})-(\d{2})$/.exec(searchParams.month ?? "");
  const year = m ? Number(m[1]) : today.getUTCFullYear();
  const monthIndex0 = m ? Math.min(11, Math.max(0, Number(m[2]) - 1)) : today.getUTCMonth();
  const canEdit = me.role === "SUPER_ADMIN" || me.permissions.CATERING.canEdit;

  return (
    <div className="mx-auto max-w-5xl">
      <Suspense key={`${year}-${monthIndex0}`} fallback={<CateringSkeleton />}>
        <CateringData year={year} monthIndex0={monthIndex0} canEdit={canEdit} />
      </Suspense>
    </div>
  );
}

async function CateringData({ year, monthIndex0, canEdit }: { year: number; monthIndex0: number; canEdit: boolean }) {
  const today = bangkokToday();
  const in3Days = new Date(today.getTime() + 3 * 86400000);
  const twelveMonthsAgo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1));

  const [monthBookings, openBookings, upcomingPickups, yearBookings, yearPickupOrders] = await Promise.all([
    loadMonthBookings(year, monthIndex0),
    // งานที่ยังไม่จบทั้งหมด (ทุกเดือน) — ใช้นับ "รอรับเงิน" และ "เลยกำหนดจ่าย" ให้ไม่หลุดงานเดือนหน้า
    prisma.cateringBooking.findMany({
      where: { status: { notIn: ["CANCELLED", "COMPLETED"] }, paymentStatus: { not: "FULLY_PAID" } },
      select: { paymentStatus: true, status: true, paymentDueDate: true, totalAmount: true, depositAmount: true },
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
  ]);

  const monthLabel = thaiMonthLabel(year, monthIndex0);
  const monthTotal = monthBookings.reduce((a, b) => a + b.totalAmount, 0);
  const waitingDeposit = openBookings.filter((b) => b.paymentStatus === "UNPAID").length;
  const waitingBalance = openBookings.filter((b) => b.paymentStatus === "DEPOSIT_PAID").length;
  const overdue = openBookings.filter((b) => bookingTone(b, today) === "overdue").length;
  const cards = monthBookings.map((b) => ({
    ...b,
    staffNames: staffNamesOf(b),
    needStaff: requiredStaff(bookingServings(b)),
  }));
  const shortStaff = cards.filter((c) => c.status !== "COMPLETED" && c.eventDate >= today && c.staffNames.length < c.needStaff).length;
  const upcoming = cards.filter((c) => (c.eventEndDate ?? c.eventDate) >= today);
  const past = cards.filter((c) => (c.eventEndDate ?? c.eventDate) < today);
  const isCurrentMonth = year === today.getUTCFullYear() && monthIndex0 === today.getUTCMonth();

  const monthlyRevenue = new Map<string, { booking: number; pickup: number; date: Date }>();
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(twelveMonthsAgo.getUTCFullYear(), twelveMonthsAgo.getUTCMonth() + i, 1));
    monthlyRevenue.set(monthKey(d), { booking: 0, pickup: 0, date: d });
  }
  for (const b of yearBookings) {
    const e = monthlyRevenue.get(monthKey(b.eventDate));
    if (e) e.booking += b.totalAmount;
  }
  for (const o of yearPickupOrders) {
    const e = monthlyRevenue.get(monthKey(o.orderDate));
    if (e) e.pickup += o.amount;
  }
  const revenueRows = Array.from(monthlyRevenue.values());
  const maxRevenue = Math.max(1, ...revenueRows.map((r) => r.booking + r.pickup));

  return (
    <>
      <CateringHeader
        title="Catering"
        sub={`${monthLabel} · ${monthBookings.length} งาน · ${formatBaht(monthTotal)} บาท`}
        actions={
          <>
            <Link href="/catering/calendar" className={headerBtn.ghost}>
              <CalendarDays className="h-4 w-4" /> ปฏิทิน
            </Link>
            {canEdit && (
              <Link href="/catering/bookings/new" className={headerBtn.primary}>
                <Plus className="h-4 w-4" /> ลงงานใหม่
              </Link>
            )}
          </>
        }
        stats={[
          { label: "งานที่จะถึง", value: `${upcoming.length}`, sub: monthLabel },
          { label: "รอรับเงิน", value: `${waitingDeposit + waitingBalance}`, sub: `ยังไม่มัดจำ ${waitingDeposit} · รอส่วนที่เหลือ ${waitingBalance}`, accent: waitingDeposit + waitingBalance ? "amber" : undefined },
          { label: "เลยกำหนดจ่าย", value: `${overdue}`, sub: overdue ? "ตามลูกค้าด่วน" : "ไม่มีงานค้าง", accent: overdue ? "red" : "emerald" },
          { label: "พนักงานยังไม่ครบ", value: `${shortStaff}`, sub: "ทุก 75 เสิร์ฟ = 1 คน", accent: shortStaff ? "orange" : "emerald" },
        ]}
      />

      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Link href={`/catering?month=${monthParam(year, monthIndex0 - 1)}`} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100" aria-label="เดือนก่อน">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <h2 className="min-w-[9rem] text-center text-lg font-bold text-gray-900">{monthLabel}</h2>
          <Link href={`/catering?month=${monthParam(year, monthIndex0 + 1)}`} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100" aria-label="เดือนถัดไป">
            <ChevronRight className="h-4 w-4" />
          </Link>
          {!isCurrentMonth && (
            <Link href="/catering" className="ml-1 rounded-lg bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white">
              เดือนนี้
            </Link>
          )}
        </div>
        <span className="text-sm font-medium text-gray-600">{upcoming.length} งานที่จะถึง</span>
      </div>

      <div className="mb-6 flex flex-col gap-2">
        {upcoming.map((b) => (
          <BookingCard key={b.id} b={b} today={today} />
        ))}
        {upcoming.length === 0 && <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-600">ไม่มีงานที่จะถึงใน{monthLabel}</p>}
        {past.length > 0 && (
          <details className="group mt-1">
            <summary className="cursor-pointer list-none py-1 text-sm font-semibold text-gray-600 hover:text-gray-900 [&::-webkit-details-marker]:hidden">
              งานที่ผ่านไปแล้วเดือนนี้ ({past.length}) <span className="group-open:hidden">▾</span>
              <span className="hidden group-open:inline">▴</span>
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              {past.map((b) => (
                <BookingCard key={b.id} b={b} today={today} />
              ))}
            </div>
          </details>
        )}
      </div>

      {upcomingPickups.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-base font-bold text-gray-900">ออเดอร์นัดรับ 3 วันข้างหน้า</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {upcomingPickups.map((o) => (
              <Link key={o.id} href={`/catering/pickup-orders/${o.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-l-4 border-gray-200 border-l-violet-500 bg-white px-4 py-3 shadow-card hover:border-gray-400">
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-gray-900">{o.customerName}</p>
                  <p className="truncate text-sm text-gray-700">
                    {formatThaiDate(o.pickupDate)}
                    {o.pickupTime ? ` · ${o.pickupTime} น.` : ""}
                    {o.branch ? ` · ${o.branch.name}` : ""}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${o.status === "READY" ? "bg-emerald-600 text-white" : "bg-amber-400 text-amber-950"}`}>{pickupStatusLabel[o.status]}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <details className="group rounded-2xl border border-gray-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-semibold text-gray-700 [&::-webkit-details-marker]:hidden">
          รายได้ย้อนหลัง 12 เดือน
          <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-1.5 border-t border-gray-100 px-5 py-4">
          {revenueRows.map((r) => {
            const total = r.booking + r.pickup;
            return (
              <div key={monthKey(r.date)} className="flex items-center gap-3 text-xs">
                <span className="w-24 shrink-0 text-gray-700">{thaiMonthLabel(r.date.getUTCFullYear(), r.date.getUTCMonth())}</span>
                <div className="flex h-4 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full bg-brand-500" style={{ width: `${(r.booking / maxRevenue) * 100}%` }} title={`จัดเลี้ยง ${formatBaht(r.booking)}`} />
                  <div className="h-full bg-emerald-400" style={{ width: `${(r.pickup / maxRevenue) * 100}%` }} title={`นัดรับ ${formatBaht(r.pickup)}`} />
                </div>
                <span className="w-24 shrink-0 text-right font-semibold tabular-nums text-gray-900">{formatBaht(total)}</span>
              </div>
            );
          })}
          <p className="mt-1 flex gap-4 text-xs text-gray-600">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-brand-500" /> งานจัดเลี้ยง</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> ออเดอร์นัดรับ</span>
          </p>
        </div>
      </details>
    </>
  );
}
