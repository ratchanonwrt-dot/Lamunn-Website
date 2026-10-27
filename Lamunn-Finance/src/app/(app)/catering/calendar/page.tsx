import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { requireSectionPage } from "@/lib/permissions";
import { formatBaht, formatThaiDate, thaiMonthLabel } from "@/lib/format";
import CapacityForm from "@/components/catering/CapacityForm";
import CateringHeader, { headerBtn } from "@/components/catering/CateringHeader";
import { TONE, bookingTone, type BookingTone } from "@/lib/cateringStatus";
import {
  bangkokToday,
  bookingDaysInMonth,
  bookingServings,
  requiredStaff,
  getCateringCapacity,
  jobsPerDay,
  loadMonthBookings,
  staffNamesOf,
  staffSummary,
  type MonthBooking,
} from "@/lib/cateringCalendar";

const DOW = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."]; // เริ่มวันจันทร์

function monthParam(year: number, monthIndex0: number) {
  const d = new Date(Date.UTC(year, monthIndex0, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function shortDay(iso: string) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return `${d.getUTCDate()}`;
}

/** ปฏิทินงาน Catering รายเดือน — ดูว่าวันไหนรับงานได้อีก, ใครไปงานไหน, และสรุปจำนวนงานรายพนักงาน */
export default async function CateringCalendarPage({ searchParams }: { searchParams: { month?: string } }) {
  const me = await requireSectionPage("CATERING");
  const today = bangkokToday();
  const todayIso = today.toISOString().slice(0, 10);
  const m = /^(\d{4})-(\d{2})$/.exec(searchParams.month ?? "");
  const year = m ? Number(m[1]) : today.getUTCFullYear();
  const monthIndex0 = m ? Math.min(11, Math.max(0, Number(m[2]) - 1)) : today.getUTCMonth();

  const [capacity, bookings] = await Promise.all([getCateringCapacity(), loadMonthBookings(year, monthIndex0)]);
  const perDay = jobsPerDay(bookings, year, monthIndex0);
  const staff = staffSummary(bookings, year, monthIndex0);
  const canEdit = me.role === "SUPER_ADMIN" || me.permissions.CATERING.canEdit;

  const daysInMonth = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
  const firstDow = (new Date(Date.UTC(year, monthIndex0, 1)).getUTCDay() + 6) % 7; // 0 = จันทร์
  const cells: (string | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(Date.UTC(year, monthIndex0, i + 1)).toISOString().slice(0, 10)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const label = thaiMonthLabel(year, monthIndex0);
  const freeDays = cells.filter((d) => d && d >= todayIso && (perDay.get(d)?.length ?? 0) < capacity).length;
  const fullDays = cells.filter((d) => d && (perDay.get(d)?.length ?? 0) >= capacity).length;
  const overdue = bookings.filter((b) => b.paymentStatus !== "FULLY_PAID" && b.paymentDueDate && b.paymentDueDate < today);
  const shortStaff = bookings.filter((b) => b.status !== "COMPLETED" && b.staffAssignments.length < requiredStaff(bookingServings(b)));
  const monthTotal = bookings.reduce((a, b) => a + b.totalAmount, 0);

  return (
    <div>
      <CateringHeader
        title="ปฏิทินงาน"
        sub={`${label} · ${bookings.length} งาน · ${formatBaht(monthTotal)} บาท`}
        actions={
          canEdit && (
            <Link href="/catering/bookings/new" className={headerBtn.primary}>
              <Plus className="h-4 w-4" /> ลงงานใหม่
            </Link>
          )
        }
        stats={[
          { label: "วันที่ยังรับงานได้", value: `${freeDays}`, sub: `เต็มแล้ว ${fullDays} วัน`, accent: "emerald" },
          { label: "งานเดือนนี้", value: `${bookings.length}`, sub: `${formatBaht(monthTotal)} บาท` },
          { label: "เลยกำหนดจ่าย", value: `${overdue.length}`, sub: overdue.map((b) => b.customer.name).join(", ") || "ไม่มีงานค้าง", accent: overdue.length ? "red" : "emerald" },
          { label: "พนักงานยังไม่ครบ", value: `${shortStaff.length}`, sub: shortStaff.map((b) => b.customer.name).join(", ") || "ครบทุกงาน", accent: shortStaff.length ? "orange" : "emerald" },
        ]}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`/catering/calendar?month=${monthParam(year, monthIndex0 - 1)}`} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100" aria-label="เดือนก่อน">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-[9rem] text-center text-lg font-bold text-gray-900">{label}</span>
          <Link href={`/catering/calendar?month=${monthParam(year, monthIndex0 + 1)}`} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100" aria-label="เดือนถัดไป">
            <ChevronRight className="h-4 w-4" />
          </Link>
          {(year !== today.getUTCFullYear() || monthIndex0 !== today.getUTCMonth()) && (
            <Link href="/catering/calendar" className="ml-1 rounded-lg bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white">
              เดือนนี้
            </Link>
          )}
        </div>
        <CapacityForm value={capacity} canEdit={canEdit} />
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium text-gray-700">
        {(["booked", "deposit", "paid", "overdue"] as BookingTone[]).map((t) => (
          <span key={t} className={`rounded-full px-2.5 py-0.5 font-semibold ${TONE[t].badge}`}>
            {TONE[t].label}
          </span>
        ))}
        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 font-semibold text-white">👤1/2</span>
        <span>= พนักงานยังไม่ครบ</span>
      </div>

      {/* ปฏิทิน — จอเล็กเลื่อนแนวนอนได้ ให้ช่องวันไม่บีบจนอ่านชื่อไม่ออก */}
      <div className="mb-6 overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="grid min-w-[840px] grid-cols-7">
          {DOW.map((d, i) => (
            <div key={d} className={`bg-gray-900 px-2 py-2 text-center text-sm font-semibold ${i >= 5 ? "text-amber-300" : "text-white"}`}>
              {d}
            </div>
          ))}
          {cells.map((day, i) => {
            if (!day) return <div key={`e${i}`} className="min-h-[110px] border-b border-r border-gray-100 bg-gray-50" />;
            const list = perDay.get(day) ?? [];
            const isPast = day < todayIso;
            const full = list.length >= capacity;
            const left = capacity - list.length;
            return (
              <div key={day} className={`min-h-[110px] border-b border-r border-gray-100 p-1.5 ${day === todayIso ? "bg-amber-50 ring-2 ring-inset ring-gray-900" : isPast ? "bg-gray-50" : ""}`}>
                <div className="mb-1 flex items-center justify-between">
                  <span className={`text-base font-bold ${isPast ? "text-gray-400" : "text-gray-900"}`}>{shortDay(day)}</span>
                  {!isPast &&
                    (full ? (
                      <span className="rounded-md bg-gray-900 px-1.5 py-0.5 text-xs font-semibold text-white">เต็ม</span>
                    ) : canEdit ? (
                      <Link href={`/catering/bookings/new?date=${day}`} className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-200" title="ลงงานวันนี้">
                        ว่าง {left} +
                      </Link>
                    ) : (
                      <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-800">ว่าง {left}</span>
                    ))}
                </div>
                <div className="flex flex-col gap-1">
                  {list.map((b) => {
                    const names = staffNamesOf(b);
                    const need = requiredStaff(bookingServings(b));
                    const short = names.length < need;
                    const tone = bookingTone(b, today);
                    return (
                      <Link
                        key={b.id}
                        href={`/catering/bookings/${b.id}`}
                        title={`${b.customer.name}${b.eventStartTime ? ` · ${b.eventStartTime}` : ""}${b.guestCount != null ? ` · ${b.guestCount} เสิร์ฟ` : ""}${names.length ? ` · ${names.join(", ")}` : ""}`}
                        className={`block rounded-lg px-2 py-1 text-xs leading-snug hover:opacity-90 ${TONE[tone].date}`}
                      >
                        <span className="block truncate text-[13px] font-bold">{b.customer.name}</span>
                        <span className="mt-0.5 flex items-center justify-between gap-1 font-medium">
                          <span>{b.eventStartTime ?? ""}</span>
                          <span className={`rounded px-1 ${short ? "bg-white font-bold text-red-700" : ""}`}>👤{names.length}/{need}</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <h2 className="mb-1 text-base font-bold text-gray-900">สรุปพนักงาน — {label}</h2>
      <p className="mb-3 text-sm text-gray-600">ใครไปงานวันไหนบ้าง รวมกี่งาน (งานหลายวันนับเป็น 1 งาน แต่นับวันทำงานทุกวัน)</p>
      {staff.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-400">ยังไม่มีการจัดพนักงานในเดือนนี้</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-gray-900 text-left text-sm text-white">
              <tr>
                <th className="px-3 py-2">พนักงาน</th>
                <th className="px-3 py-2 text-right">จำนวนงาน</th>
                <th className="px-3 py-2 text-right">วันทำงาน</th>
                <th className="px-3 py-2">ไปงานไหน วันไหน</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.name} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-2 font-semibold text-gray-900">{s.name}</td>
                  <td className="px-3 py-2 text-right font-semibold text-brand-700">{s.bookings.length}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{s.dayCount}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {s.bookings.map((b) => (
                        <Link key={b.id} href={`/catering/bookings/${b.id}`} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 hover:bg-brand-50">
                          {b.days.map(shortDay).join(", ")} — {b.customer}
                        </Link>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {bookings.length > 0 && (
        <p className="mt-4 text-xs text-gray-500">
          ข้อมูลเดือน {label} ณ {formatThaiDate(today)} · ไม่รวมงานที่ยกเลิก · งานที่เริ่มเดือนก่อนแต่จัดต่อเนื่องเข้ามาเดือนนี้ก็แสดงด้วย ({bookings.filter((b) => bookingDaysInMonth(b, year, monthIndex0).length > 1).length} งานหลายวัน)
        </p>
      )}
    </div>
  );
}
