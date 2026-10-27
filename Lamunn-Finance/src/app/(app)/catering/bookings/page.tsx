import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { prisma } from "@lamunn/db-finance";
import { requireSectionPage } from "@/lib/permissions";
import { formatBaht } from "@/lib/format";
import { bangkokToday, bookingServings, requiredStaff, staffNamesOf } from "@/lib/cateringCalendar";
import { TONE, bookingTone, type BookingTone } from "@/lib/cateringStatus";
import BookingCard from "@/components/catering/BookingCard";
import CateringHeader, { headerBtn } from "@/components/catering/CateringHeader";

const VIEWS = [
  { key: "upcoming", label: "ที่จะถึง" },
  { key: "past", label: "ที่ผ่านมา" },
  { key: "all", label: "ทั้งหมด" },
] as const;
type View = (typeof VIEWS)[number]["key"];

const TONE_FILTERS: BookingTone[] = ["booked", "deposit", "paid", "overdue", "done", "cancelled"];

/** รายการงานจัดเลี้ยง — การ์ดแทนตารางกว้าง ตัวกรองเป็นปุ่มสีเดียวกับป้ายสถานะ กดแล้วกรองทันที */
export default async function CateringBookingsPage({ searchParams }: { searchParams: { view?: string; tone?: string; q?: string } }) {
  const me = await requireSectionPage("CATERING");
  const canEdit = me.role === "SUPER_ADMIN" || me.permissions.CATERING.canEdit;
  const today = bangkokToday();
  const view: View = VIEWS.some((v) => v.key === searchParams.view) ? (searchParams.view as View) : "upcoming";
  const tone = TONE_FILTERS.includes(searchParams.tone as BookingTone) ? (searchParams.tone as BookingTone) : null;
  const q = (searchParams.q ?? "").trim();

  const rows = await prisma.cateringBooking.findMany({
    where: {
      ...(view === "upcoming" ? { OR: [{ eventDate: { gte: today } }, { eventEndDate: { gte: today } }] } : {}),
      ...(view === "past" ? { eventDate: { lt: today }, OR: [{ eventEndDate: null }, { eventEndDate: { lt: today } }] } : {}),
      ...(q ? { customer: { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } } : {}),
    },
    include: {
      customer: { select: { name: true, source: true } },
      staffAssignments: { include: { staff: { select: { name: true } } } },
      days: { select: { servings: true } },
    },
    orderBy: { eventDate: view === "past" ? "desc" : "asc" },
  });

  const cards = rows.map((b) => ({ ...b, tone: bookingTone(b, today), staffNames: staffNamesOf(b), needStaff: requiredStaff(bookingServings(b)) }));
  const counts = Object.fromEntries(TONE_FILTERS.map((t) => [t, cards.filter((c) => c.tone === t).length])) as Record<BookingTone, number>;
  const shown = tone ? cards.filter((c) => c.tone === tone) : cards.filter((c) => view === "all" || c.tone !== "cancelled");
  const total = shown.reduce((a, b) => a + b.totalAmount, 0);

  const href = (over: { view?: string; tone?: string | null }) => {
    const u = new URLSearchParams();
    const v = over.view ?? view;
    if (v !== "upcoming") u.set("view", v);
    const t = over.tone === undefined ? tone : over.tone;
    if (t) u.set("tone", t);
    if (q) u.set("q", q);
    const s = u.toString();
    return `/catering/bookings${s ? `?${s}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-5xl">
      <CateringHeader
        title="งานจัดเลี้ยง"
        sub={`${shown.length} งาน · รวม ${formatBaht(total)} บาท`}
        actions={
          canEdit && (
            <Link href="/catering/bookings/new" className={headerBtn.primary}>
              <Plus className="h-4 w-4" /> ลงงานใหม่
            </Link>
          )
        }
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-gray-200 p-1">
          {VIEWS.map((v) => (
            <Link key={v.key} href={href({ view: v.key, tone: null })} className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${view === v.key ? "bg-gray-900 text-white shadow-sm" : "text-gray-700 hover:text-gray-900"}`}>
              {v.label}
            </Link>
          ))}
        </div>
        <form className="relative">
          {view !== "upcoming" && <input type="hidden" name="view" value={view} />}
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input name="q" defaultValue={q} placeholder="ค้นหาชื่อ / เบอร์ลูกค้า" className="w-64 rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400" />
        </form>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href={href({ tone: null })} className={`rounded-full px-3 py-1 text-sm font-semibold ${!tone ? "bg-gray-900 text-white" : "bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-100"}`}>
          ทั้งหมด {cards.filter((c) => view === "all" || c.tone !== "cancelled").length}
        </Link>
        {TONE_FILTERS.filter((t) => counts[t] > 0 || t === tone).map((t) => (
          <Link key={t} href={href({ tone: tone === t ? null : t })} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${tone === t ? `${TONE[t].badge} ring-2 ring-gray-900 ring-offset-1` : "bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-100"}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${TONE[t].dot}`} />
            {TONE[t].label} {counts[t]}
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {shown.map((b) => (
          <BookingCard key={b.id} b={b} today={today} />
        ))}
        {shown.length === 0 && <p className="rounded-xl bg-white p-8 text-center text-sm text-gray-400">ไม่พบงาน</p>}
      </div>
    </div>
  );
}
