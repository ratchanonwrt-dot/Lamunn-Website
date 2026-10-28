import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@lamunn/db-finance";
import { requireSectionPage } from "@/lib/permissions";
import { formatBaht, thaiMonthLabel } from "@/lib/format";
import { bangkokToday, loadMonthBookings } from "@/lib/cateringCalendar";
import { computePeriodPay, halfMonthBounds, MEAL_ALLOWANCE, MEAL_MIN_HOURS } from "@/lib/cateringStaffPay";

type Round = 1 | 2;

/** รอบก่อน/ถัดไป — รอบ 2 ของเดือนก่อน ↔ รอบ 1 ของเดือนนี้ */
function shift(year: number, monthIndex0: number, round: Round, dir: -1 | 1) {
  let m = monthIndex0;
  let r: Round = round;
  if (dir === 1) {
    if (r === 1) r = 2;
    else {
      r = 1;
      m += 1;
    }
  } else if (r === 2) r = 1;
  else {
    r = 2;
    m -= 1;
  }
  const d = new Date(Date.UTC(year, m, 1));
  return `/catering/staff/allowance?month=${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}&round=${r}`;
}

const day = (iso: string) => `${Number(iso.slice(8, 10))}`;
const hrs = (n: number) => (Math.round(n * 10) / 10).toLocaleString("th-TH");

/** ค่ารถ + ค่าข้าว พนักงาน Catering สรุปเป็นรอบ 1–15 / 16–สิ้นเดือน (รายงานในเว็บอย่างเดียว ยังไม่ลงบัญชี/จ่ายเงิน) */
export default async function CateringAllowancePage({ searchParams }: { searchParams: { month?: string; round?: string } }) {
  await requireSectionPage("CATERING");
  const today = bangkokToday();
  const m = /^(\d{4})-(\d{2})$/.exec(searchParams.month ?? "");
  const year = m ? Number(m[1]) : today.getUTCFullYear();
  const monthIndex0 = m ? Math.min(11, Math.max(0, Number(m[2]) - 1)) : today.getUTCMonth();
  const round: Round = searchParams.round === "1" || searchParams.round === "2" ? (Number(searchParams.round) as Round) : today.getUTCDate() <= 15 ? 1 : 2;
  const { start, end } = halfMonthBounds(year, monthIndex0, round);

  const [roster, bookings] = await Promise.all([prisma.cateringStaff.findMany({ orderBy: { name: "asc" } }), loadMonthBookings(year, monthIndex0)]);
  const rows = computePeriodPay(roster, bookings, start, end).filter((r) => r.jobCount > 0);
  const totalTravel = rows.reduce((a, r) => a + r.travel, 0);
  const totalMeal = rows.reduce((a, r) => a + r.meal, 0);
  const missingHours = rows.some((r) => r.jobs.some((j) => j.hoursMissing));
  const label = `${start.getUTCDate()}–${end.getUTCDate()} ${thaiMonthLabel(year, monthIndex0)}`;
  const monthQ = `${year}-${String(monthIndex0 + 1).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900">ค่ารถ + ค่าข้าว พนักงาน Catering</h1>
        <Link href="/catering/staff" className="text-sm text-brand-700 hover:underline">
          ← รายชื่อพนักงาน + OT
        </Link>
      </div>
      <p className="mb-5 text-sm text-gray-500">
        ค่ารถ = ที่ให้ล่วงหน้าต่องาน (กรอกในหน้างาน) · ค่าข้าว {MEAL_ALLOWANCE} บาท/วัน เมื่อทำงานเกิน {MEAL_MIN_HOURS} ชั่วโมง
      </p>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link href={shift(year, monthIndex0, round, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-white" aria-label="รอบก่อน">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <h2 className="min-w-[12rem] text-center text-base font-bold text-gray-800">รอบ {label}</h2>
          <Link href={shift(year, monthIndex0, round, 1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-white" aria-label="รอบถัดไป">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="inline-flex rounded-xl bg-gray-100 p-1">
          {([1, 2] as const).map((r) => (
            <Link
              key={r}
              href={`/catering/staff/allowance?month=${monthQ}&round=${r}`}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium ${round === r ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              {r === 1 ? "รอบ 1–15" : "รอบ 16–สิ้นเดือน"}
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
          <p className="text-xs text-sky-700">ค่ารถรวม</p>
          <p className="mt-1 text-xl font-bold text-sky-800">{formatBaht(totalTravel)} ฿</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs text-amber-700">ค่าข้าวรวม</p>
          <p className="mt-1 text-xl font-bold text-amber-800">{formatBaht(totalMeal)} ฿</p>
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-600 p-4 text-white">
          <p className="text-xs opacity-80">รวมทั้งรอบ ({rows.length} คน)</p>
          <p className="mt-1 text-xl font-bold">{formatBaht(totalTravel + totalMeal)} ฿</p>
        </div>
      </div>

      {missingHours && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          บางงานยังไม่มีเวลาเริ่ม-จบ และไม่ได้กรอกชั่วโมงเอง (ขึ้น &ldquo;ไม่มีเวลา&rdquo;) — ยังไม่ได้ค่าข้าว แก้ได้ที่หน้างานนั้น
        </p>
      )}

      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <details key={r.name} className="group rounded-xl border border-gray-200 bg-white">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="min-w-[8rem] font-semibold text-gray-900">
                {r.name}
                {!r.staff && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">ไม่อยู่ในรายชื่อ</span>}
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                {r.jobCount} งาน · {r.dayCount} วัน
              </span>
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-800">ค่ารถ {formatBaht(r.travel)}</span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                ค่าข้าว {r.mealDays} วัน · {formatBaht(r.meal)}
              </span>
              <span className="ml-auto text-base font-bold text-brand-700">{formatBaht(r.travel + r.meal)} ฿</span>
            </summary>
            <div className="overflow-x-auto border-t border-gray-100 px-4 py-3">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-xs text-gray-400">
                  <tr>
                    <th className="py-1">งาน</th>
                    <th className="py-1">วันที่</th>
                    <th className="py-1 text-right">ชม./วัน</th>
                    <th className="py-1 text-right">ค่ารถ</th>
                    <th className="py-1 text-right">ค่าข้าว</th>
                  </tr>
                </thead>
                <tbody>
                  {r.jobs.map((j) => (
                    <tr key={j.bookingId} className="border-t border-gray-50">
                      <td className="py-1.5">
                        <Link href={`/catering/bookings/${j.bookingId}`} className="text-brand-700 hover:underline">
                          {j.customer}
                        </Link>
                        {j.hoursMissing && <span className="ml-1.5 rounded bg-amber-100 px-1.5 text-[10px] text-amber-700">ไม่มีเวลา</span>}
                      </td>
                      <td className="py-1.5 text-gray-600">
                        {j.dates.map((iso) => (
                          <span
                            key={iso}
                            title={j.mealDates.includes(iso) ? "ได้ค่าข้าว" : `ไม่เกิน ${MEAL_MIN_HOURS} ชม.`}
                            className={`mr-1 inline-block rounded px-1 text-xs ${j.mealDates.includes(iso) ? "bg-amber-100 font-semibold text-amber-800" : "bg-gray-100"}`}
                          >
                            {day(iso)}
                          </span>
                        ))}
                      </td>
                      <td className="py-1.5 text-right text-gray-700">{hrs(j.hoursPerDay)}</td>
                      <td className="py-1.5 text-right text-gray-700">{j.travel ? formatBaht(j.travel) : "-"}</td>
                      <td className="py-1.5 text-right font-medium text-gray-900">{j.meal ? formatBaht(j.meal) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
        {rows.length === 0 && <p className="rounded-xl bg-white p-6 text-center text-sm text-gray-400">ยังไม่มีพนักงานไปงานในรอบ {label}</p>}
      </div>
      <p className="mt-3 text-[11px] text-gray-400">
        วันที่สีเหลือง = ได้ค่าข้าว · ค่ารถนับครั้งเดียวที่วันแรกของงาน (งานหลายวันที่คร่อมรอบไม่นับซ้ำ) · ชั่วโมงต่อวันใช้ชุดเดียวกับ OT · ไม่นับงานที่ยกเลิก
      </p>
    </div>
  );
}
