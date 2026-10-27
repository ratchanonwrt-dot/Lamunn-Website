import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireSectionPage } from "@/lib/permissions";
import { formatBaht, formatThaiDate, thaiMonthLabel } from "@/lib/format";
import CapacityForm from "@/components/catering/CapacityForm";
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

/** สีตามสถานะ: จอง (ยังไม่จ่าย) = เหลือง, มัดจำแล้ว = ฟ้า, จ่ายเต็ม = เขียว */
function chipClass(b: MonthBooking) {
  if (b.paymentStatus === "FULLY_PAID") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (b.paymentStatus === "DEPOSIT_PAID") return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-800">ปฏิทินงาน Catering</h1>
        {canEdit && (
          <Link href="/catering/bookings/new" className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
            + ลงงานใหม่
          </Link>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`/catering/calendar?month=${monthParam(year, monthIndex0 - 1)}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50" aria-label="เดือนก่อน">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-[8rem] text-center text-sm font-semibold text-gray-800">{label}</span>
          <Link href={`/catering/calendar?month=${monthParam(year, monthIndex0 + 1)}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50" aria-label="เดือนถัดไป">
            <ChevronRight className="h-4 w-4" />
          </Link>
          {(year !== today.getUTCFullYear() || monthIndex0 !== today.getUTCMonth()) && (
            <Link href="/catering/calendar" className="ml-1 text-xs font-medium text-brand-600 hover:underline">
              กลับเดือนนี้
            </Link>
          )}
        </div>
        <CapacityForm value={capacity} canEdit={canEdit} />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">งานเดือนนี้</p>
          <p className="mt-1 text-lg font-bold text-brand-700">{bookings.length} งาน</p>
          <p className="text-[11px] text-gray-400">{formatBaht(monthTotal)} บาท</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">วันที่ยังรับงานได้ (นับจากวันนี้)</p>
          <p className="mt-1 text-lg font-bold text-emerald-700">{freeDays} วัน</p>
          <p className="text-[11px] text-gray-400">เต็มแล้ว {fullDays} วัน</p>
        </div>
        <div className={`rounded-xl border p-3 ${overdue.length ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"}`}>
          <p className="text-xs text-gray-500">เลยกำหนดจ่ายแล้ว</p>
          <p className={`mt-1 text-lg font-bold ${overdue.length ? "text-red-700" : "text-gray-800"}`}>{overdue.length} งาน</p>
          <p className="text-[11px] text-gray-400 line-clamp-1">{overdue.map((b) => b.customer.name).join(", ") || "-"}</p>
        </div>
        <div className={`rounded-xl border p-3 ${shortStaff.length ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-white"}`}>
          <p className="text-xs text-gray-500">พนักงานยังไม่พอ (75 เสิร์ฟ/คน)</p>
          <p className={`mt-1 text-lg font-bold ${shortStaff.length ? "text-amber-700" : "text-gray-800"}`}>{shortStaff.length} งาน</p>
          <p className="text-[11px] text-gray-400 line-clamp-1">{shortStaff.map((b) => b.customer.name).join(", ") || "-"}</p>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-amber-200 bg-amber-50" /> จอง (ยังไม่จ่าย)</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-sky-200 bg-sky-50" /> มัดจำแล้ว</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-emerald-200 bg-emerald-50" /> จ่ายเต็มแล้ว</span>
        <span>✓ = ยืนยันงานแล้ว · ⚠ = เลยกำหนดจ่าย · &ldquo;คน 1/2&rdquo; สีแดง = พนักงานยังไม่ครบตามกฎ 75 เสิร์ฟ/คน · กดวันว่างเพื่อลงงานวันนั้น</span>
      </div>

      {/* ปฏิทิน — จอเล็กเลื่อนแนวนอนได้ ให้ช่องวันไม่บีบจนอ่านชื่อไม่ออก */}
      <div className="mb-6 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <div className="grid min-w-[760px] grid-cols-7">
          {DOW.map((d, i) => (
            <div key={d} className={`border-b border-gray-100 px-2 py-1.5 text-center text-xs font-medium ${i >= 5 ? "text-brand-600" : "text-gray-500"}`}>
              {d}
            </div>
          ))}
          {cells.map((day, i) => {
            if (!day) return <div key={`e${i}`} className="min-h-[96px] border-b border-r border-gray-50 bg-gray-50/50" />;
            const list = perDay.get(day) ?? [];
            const isPast = day < todayIso;
            const full = list.length >= capacity;
            const left = capacity - list.length;
            return (
              <div key={day} className={`min-h-[96px] border-b border-r border-gray-100 p-1.5 ${day === todayIso ? "bg-brand-50/60" : isPast ? "bg-gray-50/60" : ""}`}>
                <div className="mb-1 flex items-center justify-between">
                  <span className={`text-xs font-semibold ${day === todayIso ? "text-brand-700" : isPast ? "text-gray-400" : "text-gray-700"}`}>{shortDay(day)}</span>
                  {!isPast &&
                    (full ? (
                      <span className="rounded bg-red-100 px-1.5 text-[10px] font-medium text-red-700">เต็ม</span>
                    ) : canEdit ? (
                      <Link href={`/catering/bookings/new?date=${day}`} className="rounded bg-emerald-50 px-1.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100">
                        ว่าง {left} +
                      </Link>
                    ) : (
                      <span className="rounded bg-emerald-50 px-1.5 text-[10px] font-medium text-emerald-700">ว่าง {left}</span>
                    ))}
                </div>
                <div className="flex flex-col gap-1">
                  {list.map((b) => {
                    const names = staffNamesOf(b);
                    const need = requiredStaff(bookingServings(b));
                    const short = names.length < need;
                    const late = b.paymentStatus !== "FULLY_PAID" && b.paymentDueDate && b.paymentDueDate < today;
                    return (
                      <Link key={b.id} href={`/catering/bookings/${b.id}`} className={`block rounded border px-1.5 py-1 text-[11px] leading-tight hover:opacity-80 ${chipClass(b)}`}>
                        <span className="font-semibold">
                          {b.status === "CONFIRMED" || b.status === "COMPLETED" ? "✓ " : ""}
                          {late ? "⚠ " : ""}
                          {b.customer.name}
                        </span>
                        <span className="block opacity-80">
                          {b.eventStartTime ?? ""}
                          {b.guestCount != null ? ` · ${b.guestCount} เสิร์ฟ` : ""}
                        </span>
                        <span className={`block ${short ? "font-semibold text-red-600" : "opacity-70"}`}>
                          คน {names.length}/{need}
                          {names.length ? ` · ${names.join(", ")}` : ""}
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

      <h2 className="mb-1 text-sm font-semibold text-gray-700">สรุปพนักงาน — {label}</h2>
      <p className="mb-3 text-xs text-gray-400">ใครไปงานวันไหนบ้าง รวมกี่งาน (งานหลายวันนับเป็น 1 งาน แต่นับวันทำงานทุกวัน)</p>
      {staff.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-400">ยังไม่มีการจัดพนักงานในเดือนนี้</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
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
                  <td className="px-3 py-2 font-medium text-gray-800">{s.name}</td>
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
        <p className="mt-4 text-[11px] text-gray-400">
          ข้อมูลเดือน {label} ณ {formatThaiDate(today)} · ไม่รวมงานที่ยกเลิก · งานที่เริ่มเดือนก่อนแต่จัดต่อเนื่องเข้ามาเดือนนี้ก็แสดงด้วย ({bookings.filter((b) => bookingDaysInMonth(b, year, monthIndex0).length > 1).length} งานหลายวัน)
        </p>
      )}
    </div>
  );
}
