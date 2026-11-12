import Link from "next/link";
import { CheckCircle2, ChevronLeft, ChevronRight, Scale, UserRoundCheck } from "lucide-react";
import { formatThaiDate } from "@/lib/format";
import { makeStaffColorLookup } from "@/lib/cateringStaffColor";
import type { QueueResult } from "@/lib/cateringQueue";

const SKIP_LABEL = { busy: "ติดงานอื่นวันเดียวกัน", dayOff: "วันหยุดประจำสัปดาห์" } as const;

/** คิวงานแบบเท่าเทียม: ใครไปกี่งานในเดือนนี้ + งานต่อไปควรเป็นคิวใคร (คำนวณใน lib/cateringQueue.ts) */
export default function StaffQueuePanel({
  queue,
  roster,
  label,
  prevHref,
  nextHref,
}: {
  queue: QueueResult;
  roster: { name: string; createdAt: Date }[];
  label: string;
  prevHref: string;
  nextHref: string;
}) {
  const colorOf = makeStaffColorLookup(roster);
  const { rows, maxJobs, spread, fair, nextJob } = queue;
  const eligible = rows.filter((r) => r.inRoster);
  const avg = eligible.length ? eligible.reduce((a, r) => a + r.jobs, 0) / eligible.length : 0;
  const first = eligible[0];

  return (
    <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Link href={prevHref} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100" aria-label="เดือนก่อน">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
            <Scale className="h-5 w-5 text-brand-600" /> คิวงาน — {label}
          </h2>
          <Link href={nextHref} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100" aria-label="เดือนถัดไป">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        {eligible.length > 0 &&
          (fair ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" /> เท่ากัน{spread === 1 ? " (ต่างกัน 1 งาน)" : ""}
            </span>
          ) : (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">ห่างกัน {spread} งาน — ให้คิวคนที่น้อยสุดก่อน</span>
          ))}
      </div>

      {/* งานถัดไปที่ยังขาดคน + คิวที่ควรเลือก */}
      {nextJob ? (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 p-3">
          <p className="text-xs font-semibold text-brand-700">งานถัดไปที่ยังจัดคนไม่ครบ</p>
          <Link href={`/catering/bookings/${nextJob.booking.id}`} className="mt-0.5 block text-base font-bold text-gray-900 hover:underline">
            {nextJob.booking.customer}
          </Link>
          <p className="text-sm text-gray-600">
            {formatThaiDate(nextJob.booking.eventDate)}
            {nextJob.booking.eventEndDate && nextJob.booking.eventEndDate > nextJob.booking.eventDate ? ` – ${formatThaiDate(nextJob.booking.eventEndDate)}` : ""} · จัดแล้ว{" "}
            {nextJob.booking.staffNames.length}/{nextJob.booking.required} คน (ขาดอีก {nextJob.missing})
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-xs font-semibold text-gray-700">
              <UserRoundCheck className="h-4 w-4" /> คิวต่อไป:
            </span>
            {nextJob.picks.length === 0 ? (
              <span className="text-sm text-red-600">ไม่มีคนว่างตามคิว (ทุกคนติดงาน/วันหยุด)</span>
            ) : (
              nextJob.picks.map((n) => (
                <span key={n} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset ${colorOf(n).soft}`}>
                  <span className={`h-2 w-2 rounded-full ${colorOf(n).dot}`} /> {n}
                </span>
              ))
            )}
          </div>
          {nextJob.suggestions.some((s) => s.skipped) && (
            <p className="mt-2 text-xs text-gray-500">
              ข้ามไป:{" "}
              {nextJob.suggestions
                .filter((s) => s.skipped)
                .map((s) => `${s.name} (${SKIP_LABEL[s.skipped!]})`)
                .join(" · ")}
            </p>
          )}
        </div>
      ) : (
        <p className="mb-4 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600">
          ไม่มีงานค้างจัดคนในเดือนนี้{first ? ` — ถ้ามีงานใหม่ คิวต่อไปคือ ` : ""}
          {first && <span className="font-semibold text-gray-900">{first.name}</span>}
        </p>
      )}

      {/* ใครไปกี่งาน เรียงตามคิว (คนที่ควรได้งานต่อไปอยู่บนสุด) */}
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">ยังไม่มีพนักงานที่ใช้งานในรายชื่อ</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((r, i) => {
            const c = colorOf(r.name);
            const isNext = r.inRoster && i === rows.findIndex((x) => x.inRoster);
            return (
              <div key={r.name} className="flex items-center gap-3 rounded-lg bg-gray-50 py-1.5 pl-0 pr-3">
                <span className={`h-9 w-1.5 shrink-0 rounded-r-full ${c.bar}`} />
                <span className="w-5 text-center text-xs font-bold text-gray-400">{r.inRoster ? i + 1 : "–"}</span>
                <span className="w-32 truncate text-sm font-semibold text-gray-900">
                  {r.name}
                  {!r.inRoster && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-700">นอกรายชื่อ</span>}
                </span>
                <div className="hidden h-3 flex-1 overflow-hidden rounded-full bg-gray-200 sm:block">
                  <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${maxJobs ? Math.max(r.jobs ? 6 : 0, (r.jobs / maxJobs) * 100) : 0}%` }} />
                </div>
                <span className="ml-auto text-sm font-bold text-gray-900 sm:ml-0">{r.jobs} งาน</span>
                <span className="hidden text-xs text-gray-500 md:inline">{r.days} วัน</span>
                {r.dutyDays > 0 && <span className="hidden rounded-full bg-violet-100 px-2 py-0.5 text-[11px] text-violet-800 md:inline">สอน/แทนสาขา {r.dutyDays} วัน</span>}
                {isNext && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">คิวต่อไป</span>}
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-[11px] text-gray-400">
        เรียงตามคิว: ไปงานน้อยสุดในเดือนนี้ก่อน (เท่ากันดูจำนวนวัน แล้วดูใครไปงานล่าสุดนานที่สุด) · เฉลี่ย {avg.toLocaleString("th-TH", { maximumFractionDigits: 1 })} งาน/คน ·
        งานหลายวันนับเป็น 1 งาน · สอน/แทนสาขาโชว์ประกอบ ไม่นับในคิวงานจัดเลี้ยง · ไม่นับงานที่ยกเลิก
      </p>
    </section>
  );
}
