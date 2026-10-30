import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatBaht, formatPercent } from "@/lib/format";
import YearBarChart from "@/components/charts/YearBarChart";
import LineChart from "@/components/charts/LineChart";
import type { YearOverview as YearData } from "@/lib/yearOverview";

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-gray-400">-</span>;
  const up = value >= 0;
  return (
    <span className={`text-xs font-semibold ${up ? "text-emerald-600" : "text-red-600"}`}>
      {up ? "▲" : "▼"} {formatPercent(Math.abs(value))}
    </span>
  );
}

/** ส่วน "ภาพรวมทั้งปี" บนสุดของหน้าภาพรวม — ยอดสะสมทั้งปี, กราฟรายเดือน + แนวโน้ม, ยอดสะสมเทียบปีก่อน, ตารางรายเดือน */
export default function YearOverview({ d, month }: { d: YearData; month: number }) {
  const thaiYear = d.year + 543;
  const trendText =
    d.monthlyTrendPct === null ? "ข้อมูลยังไม่พอ" : Math.abs(d.monthlyTrendPct) < 0.02 ? "ทรงตัว" : d.monthlyTrendPct > 0 ? "ขาขึ้น" : "ขาลง";
  const trendTone =
    d.monthlyTrendPct === null || Math.abs(d.monthlyTrendPct) < 0.02
      ? "border-gray-200 bg-white text-gray-800"
      : d.monthlyTrendPct > 0
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-red-200 bg-red-50 text-red-800";
  const lastMonthIdx = Math.max(0, ...d.months.filter((m) => !m.future).map((m) => m.month));
  const shown = d.months.filter((m) => !m.future);
  const lastYearIncomplete = d.lastYearFirstDataDate !== null && d.lastYearFirstDataDate > `${d.year - 1}-01-31`;
  const ch = d.channelTotals;
  const chTotal = ch.storefront + ch.delivery + ch.ecommerce + ch.event || 1;

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href={`/dashboard?year=${d.year - 1}&month=${month}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50" aria-label="ปีก่อน">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <h2 className="text-base font-bold text-gray-800">ภาพรวมทั้งปี {thaiYear}</h2>
          <Link href={`/dashboard?year=${d.year + 1}&month=${month}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50" aria-label="ปีถัดไป">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <span className="text-xs text-gray-400">ยอดรวมทุกช่องทาง: หน้าร้าน + Grab + Lineman + Shopee + E-Commerce + Event</span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="col-span-2 rounded-xl border border-brand-200 bg-brand-50 p-4 lg:col-span-1">
          <p className="text-xs text-brand-700">ยอดรวมทั้งปี {thaiYear}{d.projection ? ` (ถึง ${MONTHS[lastMonthIdx]})` : ""}</p>
          <p className="mt-1 text-2xl font-bold text-brand-700">{formatBaht(d.ytd)}</p>
          <p className="mt-0.5 text-xs text-brand-700">
            <Change value={d.ytdChange} /> เทียบช่วงเดียวกันปีก่อน ({formatBaht(d.lastYearSamePeriod)})
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">คาดการณ์ทั้งปี</p>
          <p className="mt-1 text-lg font-bold text-gray-800">{d.projection ? formatBaht(d.projection) : formatBaht(d.ytd)}</p>
          <p className="text-[11px] text-gray-400">{d.projection ? "ตามยอดเฉลี่ยต่อวันตั้งแต่ต้นปี" : "ปีนี้จบแล้ว"}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">เฉลี่ยต่อเดือน</p>
          <p className="mt-1 text-lg font-bold text-gray-800">{formatBaht(d.avgPerMonth)}</p>
          <p className="text-[11px] text-gray-400">จาก {d.completedMonths} เดือนที่จบแล้ว</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">เดือนที่ขายดีที่สุด</p>
          <p className="mt-1 text-lg font-bold text-gray-800">{d.best ? MONTHS[d.best.month] : "-"}</p>
          <p className="text-[11px] text-gray-400">{d.best ? `${formatBaht(d.best.total)} บาท` : ""}</p>
        </div>
        <div className={`rounded-xl border p-4 ${trendTone}`}>
          <p className="text-xs">แนวโน้มทั้งปี</p>
          <p className="mt-1 text-lg font-bold">{trendText}</p>
          <p className="text-[11px]">
            {d.monthlyTrendPct === null ? "ต้องมีอย่างน้อย 3 เดือนที่จบแล้ว" : `${d.monthlyTrendPct >= 0 ? "+" : "−"}${formatPercent(Math.abs(d.monthlyTrendPct))} ต่อเดือน`}
          </p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="rounded-xl border border-gray-200 bg-white p-5 xl:col-span-3">
          <p className="mb-3 text-sm font-semibold text-gray-700">ยอดขายรายเดือน — ปี {thaiYear}</p>
          <YearBarChart
            labels={MONTHS}
            bars={d.months.map((m) => (m.future ? null : m.total))}
            partial={d.months.map((m) => m.partial)}
            lastYear={d.months.map((m) => m.lastYear)}
            trend={d.ma3}
          />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 xl:col-span-2">
          <p className="mb-3 text-sm font-semibold text-gray-700">ยอดสะสมทั้งปี เทียบปีก่อน</p>
          <LineChart
            xLabels={MONTHS}
            series={[
              { label: `ปี ${thaiYear}`, color: "#3468b5", points: shown.map((m) => m.cumulative) },
              { label: `ปี ${thaiYear - 1}`, color: "#a39e93", points: d.months.map((m) => m.lastYearCumulative), dashed: true },
            ]}
          />
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            {(
              [
                ["หน้าร้าน", ch.storefront, "bg-brand-500"],
                ["Delivery (Grab+Lineman+Shopee)", ch.delivery, "bg-emerald-500"],
                ["E-Commerce", ch.ecommerce, "bg-amber-500"],
                ["Event", ch.event, "bg-violet-500"],
              ] as const
            ).map(([label, v, color]) => (
              <div key={label} className="flex items-center justify-between rounded-lg bg-gray-50 px-2.5 py-1.5">
                <span className="flex items-center gap-1.5 text-gray-600">
                  <span className={`h-2 w-2 rounded-full ${color}`} />
                  {label}
                </span>
                <span className="font-medium text-gray-800">{formatPercent(v / chTotal)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <details className="group rounded-xl border border-gray-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-semibold text-gray-700 [&::-webkit-details-marker]:hidden">
          ตารางรายเดือน ปี {thaiYear} (แยกช่องทาง + เทียบปีก่อน)
          <span className="text-xs font-normal text-gray-400 group-open:hidden">ดู ▾</span>
          <span className="hidden text-xs font-normal text-gray-400 group-open:inline">ซ่อน ▴</span>
        </summary>
        <div className="overflow-x-auto border-t border-gray-100">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2">เดือน</th>
                <th className="px-3 py-2 text-right">หน้าร้าน</th>
                <th className="px-3 py-2 text-right">Delivery</th>
                <th className="px-3 py-2 text-right">E-Commerce</th>
                <th className="px-3 py-2 text-right">Event</th>
                <th className="px-3 py-2 text-right">รวม</th>
                <th className="px-3 py-2 text-right">ปีก่อน</th>
                <th className="px-3 py-2 text-right">เทียบปีก่อน</th>
                <th className="px-3 py-2 text-right">สะสม</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.month} className="border-t border-gray-100">
                  <td className="px-3 py-1.5 text-gray-700">
                    {MONTHS[m.month]}
                    {m.partial && <span className="ml-1 text-[11px] text-gray-400">(ยังไม่จบเดือน)</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right text-gray-600">{formatBaht(m.storefront)}</td>
                  <td className="px-3 py-1.5 text-right text-gray-600">{formatBaht(m.delivery)}</td>
                  <td className="px-3 py-1.5 text-right text-gray-600">{formatBaht(m.ecommerce)}</td>
                  <td className="px-3 py-1.5 text-right text-gray-600">{m.event ? formatBaht(m.event) : "-"}</td>
                  <td className="px-3 py-1.5 text-right font-semibold text-gray-800">{formatBaht(m.total)}</td>
                  <td className="px-3 py-1.5 text-right text-gray-400">{m.lastYear ? formatBaht(m.lastYear) : "-"}</td>
                  <td className="px-3 py-1.5 text-right">
                    <Change value={m.yoy} />
                  </td>
                  <td className="px-3 py-1.5 text-right text-gray-500">{formatBaht(m.cumulative)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-800">
                <td className="px-3 py-2">รวม</td>
                <td className="px-3 py-2 text-right">{formatBaht(ch.storefront)}</td>
                <td className="px-3 py-2 text-right">{formatBaht(ch.delivery)}</td>
                <td className="px-3 py-2 text-right">{formatBaht(ch.ecommerce)}</td>
                <td className="px-3 py-2 text-right">{formatBaht(ch.event)}</td>
                <td className="px-3 py-2 text-right text-brand-700">{formatBaht(d.ytd)}</td>
                <td className="px-3 py-2 text-right text-gray-500">{formatBaht(d.lastYearFull)}</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      </details>
      {lastYearIncomplete && (
        <p className="mt-2 text-[11px] text-amber-600">
          หมายเหตุ: ข้อมูลปี {thaiYear - 1} ในระบบเริ่มตั้งแต่ {d.lastYearFirstDataDate} — ตัวเลขเทียบปีก่อนของเดือนก่อนหน้านั้นยังไม่ครบ
        </p>
      )}
    </section>
  );
}
