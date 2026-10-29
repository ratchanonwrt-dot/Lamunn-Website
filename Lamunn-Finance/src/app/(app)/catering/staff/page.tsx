import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@lamunn/db-finance";
import { requireSectionPage } from "@/lib/permissions";
import { formatBaht, thaiMonthLabel } from "@/lib/format";
import { bangkokToday, loadMonthBookings, knownCateringStaffNames } from "@/lib/cateringCalendar";
import { computeMonthPay, parseDayOffs, DOW_TH } from "@/lib/cateringStaffPay";
import StaffRosterManager from "@/components/catering/StaffRosterManager";

function monthParam(year: number, monthIndex0: number) {
  const d = new Date(Date.UTC(year, monthIndex0, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const hrs = (n: number) => (Math.round(n * 10) / 10).toLocaleString("th-TH");
const day = (iso: string) => `${Number(iso.slice(8, 10))}`;

/** พนักงาน Catering: รายชื่อ + วันหยุด + อัตรา OT และสรุป OT สิ้นเดือน (ใครไปงานไหน กี่ชั่วโมง ได้เท่าไหร่) */
export default async function CateringStaffPage({ searchParams }: { searchParams: { month?: string } }) {
  await requireSectionPage("CATERING");
  const today = bangkokToday();
  const m = /^(\d{4})-(\d{2})$/.exec(searchParams.month ?? "");
  const year = m ? Number(m[1]) : today.getUTCFullYear();
  const monthIndex0 = m ? Math.min(11, Math.max(0, Number(m[2]) - 1)) : today.getUTCMonth();

  const [roster, bookings, known] = await Promise.all([
    prisma.cateringStaff.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    loadMonthBookings(year, monthIndex0),
    knownCateringStaffNames(),
  ]);
  const pay = computeMonthPay(roster, bookings, year, monthIndex0);
  const inRoster = new Set(roster.map((r) => r.name.trim().toLowerCase()));
  const suggest = known.filter((n) => !inRoster.has(n.toLowerCase()));
  const totalPay = pay.reduce((a, r) => a + r.pay, 0);
  const totalHours = pay.reduce((a, r) => a + r.normalHours + r.dayOffHours, 0);
  const missingHours = pay.some((r) => r.jobs.some((j) => j.hoursMissing));
  const label = thaiMonthLabel(year, monthIndex0);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900">พนักงาน Catering</h1>
        <Link href="/catering/staff/allowance" className="text-sm text-brand-700 hover:underline">
          ค่ารถ + ค่าข้าว รายรอบ →
        </Link>
      </div>
      <p className="mb-5 text-sm text-gray-500">ตั้งวันหยุดและค่า OT ของแต่ละคน ระบบคิด OT ให้อัตโนมัติจากงานที่ถูกเลือกไป (นับเฉพาะช่วงก่อน 10:00 และหลัง 19:00)</p>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-bold text-gray-800">รายชื่อ ({roster.filter((r) => r.isActive).length} คน)</h2>
        <StaffRosterManager staff={roster} suggestNames={suggest} />
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Link href={`/catering/staff?month=${monthParam(year, monthIndex0 - 1)}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-white" aria-label="เดือนก่อน">
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <h2 className="min-w-[10rem] text-center text-base font-bold text-gray-800">สรุป OT {label}</h2>
            <Link href={`/catering/staff?month=${monthParam(year, monthIndex0 + 1)}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-white" aria-label="เดือนถัดไป">
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="flex gap-2">
            <span className="rounded-xl bg-white px-3 py-1.5 text-sm text-gray-600 ring-1 ring-gray-200">รวม {hrs(totalHours)} ชม.</span>
            <span className="rounded-xl bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white">ค่า OT รวม {formatBaht(totalPay)} ฿</span>
          </div>
        </div>
        {missingHours && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            บางงานยังไม่ได้ใส่เวลาเริ่ม-จบ และไม่ได้กรอกชั่วโมงเอง (ขึ้น &ldquo;ไม่มีเวลา&rdquo;) — นับเป็น 0 ชม. แก้ได้ที่หน้างานนั้น
          </p>
        )}

        <div className="flex flex-col gap-2">
          {pay.map((r) => {
            const offs = parseDayOffs(r.staff?.dayOffs);
            return (
              <details key={r.name} className="group rounded-xl border border-gray-200 bg-white">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-[8rem] font-semibold text-gray-900">
                    {r.name}
                    {!r.staff && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">ไม่อยู่ในรายชื่อ</span>}
                  </span>
                  <span className="text-xs text-gray-500">หยุด {offs.length ? offs.map((d) => DOW_TH[d]).join(" ") : "-"}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{r.jobCount} งาน · {r.dayCount} วัน</span>
                  {r.dayOffDayCount > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">ไปวันหยุด {r.dayOffDayCount} วัน</span>}
                  <span className="text-xs text-gray-500">
                    {hrs(r.normalHours)} ชม.{r.dayOffHours ? ` + วันหยุด ${hrs(r.dayOffHours)} ชม.` : ""}
                  </span>
                  <span className="ml-auto text-base font-bold text-brand-700">{formatBaht(r.pay)} ฿</span>
                </summary>
                <div className="border-t border-gray-100 px-4 py-3">
                  {r.jobs.length === 0 ? (
                    <p className="text-sm text-gray-400">เดือนนี้ยังไม่ได้ไปงาน</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-gray-400">
                        <tr>
                          <th className="py-1">งาน</th>
                          <th className="py-1">วันที่</th>
                          <th className="py-1 text-right">ชม.ปกติ</th>
                          <th className="py-1 text-right">ชม.วันหยุด</th>
                          <th className="py-1 text-right">ค่า OT</th>
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
                                <span key={iso} className={`mr-1 inline-block rounded px-1 text-xs ${j.dayOffDates.includes(iso) ? "bg-rose-100 font-semibold text-rose-700" : "bg-gray-100"}`}>
                                  {day(iso)}
                                </span>
                              ))}
                            </td>
                            <td className="py-1.5 text-right text-gray-700">{hrs(j.normalHours)}</td>
                            <td className="py-1.5 text-right text-rose-700">{j.dayOffHours ? hrs(j.dayOffHours) : "-"}</td>
                            <td className="py-1.5 text-right font-medium text-gray-900">{formatBaht(j.pay)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {r.staff && (
                    <p className="mt-2 text-[11px] text-gray-400">
                      อัตรา OT {formatBaht(r.staff.otRatePerHour)} ฿/ชม. · วันหยุด {formatBaht(r.staff.dayOffRatePerHour ?? r.staff.otRatePerHour)} ฿/ชม.
                    </p>
                  )}
                </div>
              </details>
            );
          })}
          {pay.length === 0 && <p className="rounded-xl bg-white p-6 text-center text-sm text-gray-400">ยังไม่มีพนักงานไปงานใน{label}</p>}
        </div>
        <p className="mt-3 text-[11px] text-gray-400">
          OT นับเฉพาะช่วงก่อน 10:00 และหลัง 19:00 ของเวลางาน × จำนวนวัน (แก้เป็นรายคนได้ที่หน้างาน) · วันที่สีชมพู = ตรงกับวันหยุดของคนนั้น นับทั้งงานเป็น OT อัตราวันหยุด · ไม่นับงานที่ยกเลิก
        </p>
      </section>
    </div>
  );
}
