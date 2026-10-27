import { Suspense } from "react";
import Link from "next/link";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { prisma } from "@lamunn/db-finance";
import { requireSectionPage } from "@/lib/permissions";
import { formatBaht, formatThaiDate, pickupStatusLabel, thaiMonthLabel } from "@/lib/format";
import { bangkokToday, bookingServings, loadMonthBookings, requiredStaff, staffNamesOf } from "@/lib/cateringCalendar";
import { bookingTone } from "@/lib/cateringStatus";
import BookingCard from "@/components/catering/BookingCard";

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
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-white" />
        ))}
      </div>
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
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">Catering</h1>
        <div className="flex gap-2">
          <Link href="/catering/calendar" className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <CalendarDays className="h-4 w-4" /> ปฏิทินงาน
          </Link>
          {canEdit && (
            <Link href="/catering/bookings/new" className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              <Plus className="h-4 w-4" /> ลงงานใหม่
            </Link>
          )}
        </div>
      </div>
      <Suspense key={`${year}-${monthIndex0}`} fallback={<CateringSkeleton />}>
        <CateringData year={year} monthIndex0={monthIndex0} />
      </Suspense>
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  return (
    <div className={`rounded-2xl p-4 ${tone}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs opacity-70">{sub}</p>}
    </div>
  );
}

async function CateringData({ year, monthIndex0 }: { year: number; monthIndex0: number }) {
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
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={`งาน ${monthLabel}`} value={`${monthBookings.length} งาน`} sub={`${formatBaht(monthTotal)} บาท`} tone="bg-brand-600 text-white" />
        <Tile label="รอรับเงิน" value={`${waitingDeposit + waitingBalance} งาน`} sub={`ยังไม่มัดจำ ${waitingDeposit} · รอยอดที่เหลือ ${waitingBalance}`} tone="bg-amber-100 text-amber-900" />
        <Tile label="เลยกำหนดจ่าย" value={`${overdue} งาน`} sub={overdue ? "ตามลูกค้าด่วน" : "ไม่มีงานค้าง"} tone={overdue ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-700"} />
        <Tile label="พนักงานยังไม่ครบ" value={`${shortStaff} งาน`} sub="ทุก 75 เสิร์ฟ = 1 คน" tone={shortStaff ? "bg-orange-100 text-orange-800" : "bg-gray-100 text-gray-700"} />
      </div>

      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Link href={`/catering?month=${monthParam(year, monthIndex0 - 1)}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-white" aria-label="เดือนก่อน">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <h2 className="min-w-[8rem] text-center text-base font-bold text-gray-800">{monthLabel}</h2>
          <Link href={`/catering?month=${monthParam(year, monthIndex0 + 1)}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-white" aria-label="เดือนถัดไป">
            <ChevronRight className="h-4 w-4" />
          </Link>
          {!isCurrentMonth && (
            <Link href="/catering" className="ml-1 text-xs font-medium text-brand-600 hover:underline">
              เดือนนี้
            </Link>
          )}
        </div>
        <span className="text-xs text-gray-400">{upcoming.length} งานที่จะถึง</span>
      </div>

      <div className="mb-6 flex flex-col gap-2">
        {upcoming.map((b) => (
          <BookingCard key={b.id} b={b} today={today} />
        ))}
        {upcoming.length === 0 && <p className="rounded-xl bg-white p-6 text-center text-sm text-gray-400">ไม่มีงานที่จะถึงใน{monthLabel}</p>}
        {past.length > 0 && (
          <details className="group mt-1">
            <summary className="cursor-pointer list-none py-1 text-xs font-medium text-gray-500 hover:text-gray-700 [&::-webkit-details-marker]:hidden">
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
          <h2 className="mb-2 text-sm font-bold text-gray-800">ออเดอร์นัดรับ 3 วันข้างหน้า</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {upcomingPickups.map((o) => (
              <Link key={o.id} href={`/catering/pickup-orders/${o.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm hover:shadow-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-800">{o.customerName}</p>
                  <p className="truncate text-xs text-gray-500">
                    {formatThaiDate(o.pickupDate)}
                    {o.pickupTime ? ` · ${o.pickupTime} น.` : ""}
                    {o.branch ? ` · ${o.branch.name}` : ""}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{pickupStatusLabel[o.status]}</span>
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
                <span className="w-24 shrink-0 text-gray-500">{thaiMonthLabel(r.date.getUTCFullYear(), r.date.getUTCMonth())}</span>
                <div className="flex h-4 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full bg-brand-500" style={{ width: `${(r.booking / maxRevenue) * 100}%` }} title={`จัดเลี้ยง ${formatBaht(r.booking)}`} />
                  <div className="h-full bg-emerald-400" style={{ width: `${(r.pickup / maxRevenue) * 100}%` }} title={`นัดรับ ${formatBaht(r.pickup)}`} />
                </div>
                <span className="w-24 shrink-0 text-right font-medium text-gray-700">{formatBaht(total)}</span>
              </div>
            );
          })}
          <p className="mt-1 flex gap-4 text-[11px] text-gray-400">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-brand-500" /> งานจัดเลี้ยง</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> ออเดอร์นัดรับ</span>
          </p>
        </div>
      </details>
    </>
  );
}
