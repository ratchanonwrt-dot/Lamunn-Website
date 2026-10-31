import Link from "next/link";
import { formatBaht, formatPercent, formatThaiDate } from "@/lib/format";
import LineChart from "@/components/charts/LineChart";
import { CHART_COLORS } from "@/components/charts/DonutChart";
import type { BranchLite } from "@/lib/reportsCalc";
import type { ExplorerResult } from "@/lib/salesExplorer";

export interface ExplorerParams {
  year: number;
  month: number;
  branchIds: string[]; // ว่าง = ทุกสาขา
  from: string;
  to: string;
  presets: { label: string; from: string; to: string }[];
}

const DOW_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสฯ", "ศุกร์", "เสาร์"];
const DOW_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
// เรียงจันทร์ → อาทิตย์ ให้อ่านแบบสัปดาห์ทำงาน
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function Change({ value, big }: { value: number | null; big?: boolean }) {
  if (value === null) return <span className="text-xs text-gray-400">-</span>;
  const up = value >= 0;
  return (
    <span className={`${big ? "text-base" : "text-xs"} font-semibold ${up ? "text-emerald-600" : "text-red-600"}`}>
      {up ? "▲" : "▼"} {formatPercent(Math.abs(value))}
    </span>
  );
}

function short(iso: string) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

export default function SalesExplorer({ allBranches, r, p }: { allBranches: BranchLite[]; r: ExplorerResult; p: ExplorerParams }) {
  const selected = new Set(p.branchIds);
  const label =
    p.branchIds.length === 0
      ? "ทุกสาขา"
      : p.branchIds.length <= 3
        ? allBranches.filter((b) => selected.has(b.id)).map((b) => b.name).join(", ")
        : `${p.branchIds.length} สาขา`;
  const multi = p.branchIds.length !== 1;
  const t = r.trend;

  const qs = (over: { xFrom?: string; xTo?: string }) => {
    const u = new URLSearchParams({ year: String(p.year), month: String(p.month), xFrom: over.xFrom ?? p.from, xTo: over.xTo ?? p.to });
    for (const id of p.branchIds) u.append("xBr", id);
    return `/reports?${u.toString()}#sales-explorer`;
  };

  const active = allBranches.filter((b) => b.isActive);
  const closed = allBranches.filter((b) => !b.isActive);
  const directionText = { up: "ขาขึ้น", down: "ขาลง", flat: "ทรงตัว", none: "ข้อมูลไม่พอ" }[t.direction];
  const directionClass = { up: "text-emerald-700 bg-emerald-50 border-emerald-200", down: "text-red-700 bg-red-50 border-red-200", flat: "text-gray-700 bg-gray-50 border-gray-200", none: "text-gray-500 bg-gray-50 border-gray-200" }[t.direction];
  const maxWeekday = Math.max(1, ...t.byWeekday.map((w) => w.avg));
  const channelTotal = r.totals.total || 1;
  // คอลัมน์ Shopee โชว์เฉพาะช่วงที่มียอด (ช่องทางเริ่ม 30 ต.ค. 2569) — ช่วงก่อนหน้านั้นตารางจะไม่มีคอลัมน์ว่างเพิ่ม
  const hasShopee = r.totals.shopee !== 0;
  const exportHref =
    p.branchIds.length <= 1 ? `/reports/branch-sales?${new URLSearchParams({ ...(p.branchIds[0] ? { branchId: p.branchIds[0] } : {}), from: p.from, to: p.to }).toString()}` : null;

  return (
    <div>
      {/* ฟอร์ม GET ธรรมดา — เลือกสาขาได้หลายสาขา ค่าอยู่ใน URL ส่งลิงก์ให้คนอื่นเห็นแบบเดียวกันได้ */}
      <form action="/reports" method="get" className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm">
        <input type="hidden" name="year" value={p.year} />
        <input type="hidden" name="month" value={p.month} />
        <details className="relative">
          <summary className="flex cursor-pointer list-none flex-col gap-1 text-xs text-gray-500 [&::-webkit-details-marker]:hidden">
            สาขา
            <span className="min-w-[12rem] rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-800">
              {label} <span className="text-gray-400">▾</span>
            </span>
          </summary>
          <div className="absolute z-20 mt-1 max-h-80 w-72 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
            <p className="mb-1 px-1 text-[11px] text-gray-400">ไม่ติ๊กเลย = ทุกสาขา</p>
            {active.map((b) => (
              <label key={b.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-gray-50">
                <input type="checkbox" name="xBr" value={b.id} defaultChecked={selected.has(b.id)} />
                <span className="text-gray-800">{b.name}</span>
                <span className="ml-auto text-[10px] text-gray-400">{b.type === "CREDIT_TERM" ? "CT" : "เงินสด"}</span>
              </label>
            ))}
            {closed.length > 0 && <p className="mt-2 border-t border-gray-100 px-1 pt-2 text-[11px] text-gray-400">ปิดแล้ว</p>}
            {closed.map((b) => (
              <label key={b.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-gray-500 hover:bg-gray-50">
                <input type="checkbox" name="xBr" value={b.id} defaultChecked={selected.has(b.id)} />
                {b.name}
              </label>
            ))}
          </div>
        </details>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          ตั้งแต่
          <input type="date" name="xFrom" defaultValue={p.from} className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-800" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          ถึง
          <input type="date" name="xTo" defaultValue={p.to} className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-800" />
        </label>
        <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          ดูยอดขาย
        </button>
        <div className="flex flex-wrap gap-1.5">
          {p.presets.map((pr) => {
            const on = pr.from === p.from && pr.to === p.to;
            return (
              <Link key={pr.label} href={qs({ xFrom: pr.from, xTo: pr.to })} scroll={false} className={`rounded-full border px-3 py-1 text-xs ${on ? "border-brand-300 bg-brand-50 font-medium text-brand-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                {pr.label}
              </Link>
            );
          })}
        </div>
      </form>
      <p className="mb-4 text-xs text-gray-400">
        {label} · {formatThaiDate(new Date(`${p.from}T00:00:00Z`))} – {formatThaiDate(new Date(`${p.to}T00:00:00Z`))} ({r.days.length} วัน) · ยอด = หน้าร้าน + Grab + Lineman
        {exportHref && (
          <>
            {" · "}
            <Link href={exportHref} className="text-brand-600 hover:underline">
              Export Excel →
            </Link>
          </>
        )}
      </p>

      {t.openDays === 0 ? (
        <p className="text-sm text-gray-400">ไม่มียอดขายในช่วงนี้</p>
      ) : (
        <>
          {/* ตัวเลขสรุป + ทิศทาง Trend */}
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs text-gray-500">ยอดรวมทั้งช่วง</p>
              <p className="mt-1 text-lg font-bold text-brand-700">{formatBaht(r.totals.total)}</p>
              <p className="text-[11px] text-gray-400">มียอด {t.openDays} จาก {r.days.length} วัน</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs text-gray-500">เฉลี่ยต่อวันที่มียอด</p>
              <p className="mt-1 text-lg font-bold text-gray-800">{formatBaht(t.avgPerDay)}</p>
              {t.best && t.worst && (
                <p className="text-[11px] text-gray-400">
                  สูงสุด {short(t.best.date)} {formatBaht(t.best.total)} · ต่ำสุด {short(t.worst.date)} {formatBaht(t.worst.total)}
                </p>
              )}
            </div>
            <div className={`rounded-lg border p-3 ${directionClass}`}>
              <p className="text-xs">แนวโน้ม (Trend)</p>
              <p className="mt-1 text-lg font-bold">{directionText}</p>
              <p className="text-[11px]">
                {t.weeklyPct === null ? "ต้องมีอย่างน้อย 4 วันที่มียอด" : `${t.weeklyPct >= 0 ? "+" : "−"}${formatPercent(Math.abs(t.weeklyPct))} ต่อสัปดาห์ (${t.slopePerDay >= 0 ? "+" : "−"}${formatBaht(Math.abs(t.slopePerDay))} บาท/วัน)`}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs text-gray-500">ครึ่งหลังเทียบครึ่งแรกของช่วง</p>
              <p className="mt-1">
                <Change value={t.halfChange} big />
              </p>
              <p className="text-[11px] text-gray-400">
                {formatBaht(t.firstHalfAvg)} → {formatBaht(t.secondHalfAvg)} /วัน
              </p>
            </div>
          </div>

          {/* กราฟยอดรายวัน + เส้นเฉลี่ย 7 วัน */}
          <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
            <p className="mb-3 text-xs font-semibold text-gray-600">ยอดขายรายวัน และค่าเฉลี่ยเคลื่อนที่ 7 วัน</p>
            <LineChart
              xLabels={r.days.map((d) => short(d.date))}
              series={[
                { label: "ยอดรวมรายวัน", color: CHART_COLORS.blue, points: r.days.map((d) => d.total) },
                { label: "เฉลี่ย 7 วัน (เส้นแนวโน้ม)", color: CHART_COLORS.orange, points: r.days.map((d) => d.ma7 ?? d.total), dashed: true },
              ]}
            />
            <p className="mt-2 text-[11px] text-gray-400">
              เส้นเฉลี่ย 7 วันตัดความแกว่งรายวันออก ช่วยให้เห็นทิศทางจริง — วันที่ยอดเป็น 0 ไม่ถูกนับในค่าเฉลี่ย ถ้าวันท้ายๆ ของช่วงยอดต่ำผิดปกติ อาจเป็นเพราะบางสาขายังส่งยอดไม่ครบ
            </p>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {/* วันในสัปดาห์ */}
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="mb-3 text-xs font-semibold text-gray-600">เฉลี่ยตามวันในสัปดาห์</p>
              <div className="flex flex-col gap-1.5">
                {WEEK_ORDER.map((dow) => {
                  const w = t.byWeekday[dow];
                  const diff = t.avgPerDay ? (w.avg - t.avgPerDay) / t.avgPerDay : null;
                  return (
                    <div key={dow} className="flex items-center gap-2 text-xs">
                      <span className={`w-14 shrink-0 ${dow === 0 || dow === 6 ? "font-medium text-brand-700" : "text-gray-500"}`}>{DOW_TH[dow]}</span>
                      <div className="h-4 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div className={`h-full rounded-full ${dow === 0 || dow === 6 ? "bg-brand-500" : "bg-brand-300"}`} style={{ width: `${w.days ? Math.max(2, (w.avg / maxWeekday) * 100) : 0}%` }} />
                      </div>
                      <span className="w-20 shrink-0 text-right font-medium text-gray-700">{w.days ? formatBaht(w.avg) : "-"}</span>
                      <span className="w-14 shrink-0 text-right">{w.days ? <Change value={diff} /> : null}</span>
                      <span className="w-8 shrink-0 text-right text-[10px] text-gray-400">{w.days}วัน</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-gray-400">% เทียบค่าเฉลี่ยทุกวันของช่วงนี้</p>
            </div>

            {/* ช่องทาง */}
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="mb-3 text-xs font-semibold text-gray-600">แยกประเภทช่องทาง</p>
              <table className="w-full text-sm">
                <tbody>
                  {(
                    [
                      ["หน้าร้าน — เงินสด", r.totals.cash],
                      ["หน้าร้าน — เงินโอน", r.totals.transfer],
                      ["หน้าร้าน — Credit Term (ห้างเก็บ)", r.totals.creditStorefront],
                      ["Grab", r.totals.grab],
                      ["Lineman", r.totals.lineman],
                      ["Shopee", r.totals.shopee],
                    ] as const
                  )
                    .filter(([, v]) => v !== 0)
                    .map(([name, v]) => (
                      <tr key={name} className="border-t border-gray-100 first:border-0">
                        <td className="py-1.5 text-gray-600">{name}</td>
                        <td className="py-1.5 text-right font-medium text-gray-800">{formatBaht(v)}</td>
                        <td className="w-16 py-1.5 text-right text-xs text-gray-400">{formatPercent(v / channelTotal)}</td>
                      </tr>
                    ))}
                  <tr className="border-t-2 border-gray-200 font-semibold">
                    <td className="py-1.5 text-gray-800">รวม</td>
                    <td className="py-1.5 text-right text-brand-700">{formatBaht(r.totals.total)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* รายสาขา — เฉพาะตอนเลือกมากกว่า 1 สาขา */}
          {multi && r.branches.length > 1 && (
            <div className="mb-4 overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2">สาขา</th>
                    <th className="px-3 py-2 text-right">วันที่มียอด</th>
                    <th className="px-3 py-2 text-right">หน้าร้าน</th>
                    <th className="px-3 py-2 text-right">Grab</th>
                    <th className="px-3 py-2 text-right">Lineman</th>
                    {hasShopee && <th className="px-3 py-2 text-right">Shopee</th>}
                    <th className="px-3 py-2 text-right">รวม</th>
                    <th className="px-3 py-2 text-right">เฉลี่ย/วัน</th>
                  </tr>
                </thead>
                <tbody>
                  {r.branches.map((b) => (
                    <tr key={b.branch.id} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 font-medium text-gray-800">{b.branch.name}</td>
                      <td className="px-3 py-1.5 text-right text-gray-500">{b.openDays}</td>
                      <td className="px-3 py-1.5 text-right text-gray-600">{formatBaht(b.storefront)}</td>
                      <td className="px-3 py-1.5 text-right text-gray-600">{formatBaht(b.grab)}</td>
                      <td className="px-3 py-1.5 text-right text-gray-600">{formatBaht(b.lineman)}</td>
                      {hasShopee && <td className="px-3 py-1.5 text-right text-gray-600">{formatBaht(b.shopee)}</td>}
                      <td className="px-3 py-1.5 text-right font-medium text-gray-800">{formatBaht(b.total)}</td>
                      <td className="px-3 py-1.5 text-right text-gray-700">{formatBaht(b.avgPerDay)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ตารางรายวัน */}
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2">วันที่</th>
                  <th className="px-3 py-2 text-right">เงินสด</th>
                  <th className="px-3 py-2 text-right">เงินโอน</th>
                  <th className="px-3 py-2 text-right">Credit Term</th>
                  <th className="px-3 py-2 text-right">หน้าร้านรวม</th>
                  <th className="px-3 py-2 text-right">Grab</th>
                  <th className="px-3 py-2 text-right">Lineman</th>
                  {hasShopee && <th className="px-3 py-2 text-right">Shopee</th>}
                  <th className="px-3 py-2 text-right">รวม</th>
                  <th className="px-3 py-2 text-right">เฉลี่ย 7 วัน</th>
                  {multi && <th className="px-3 py-2 text-right">สาขาที่มียอด</th>}
                </tr>
              </thead>
              <tbody>
                {r.days.map((d) => {
                  const weekend = d.dow === 0 || d.dow === 6;
                  return (
                    <tr key={d.date} className={`border-t border-gray-100 ${d.total === 0 ? "text-gray-300" : ""} ${weekend ? "bg-brand-50/40" : ""}`}>
                      <td className="whitespace-nowrap px-3 py-1.5 text-gray-700">
                        {short(d.date)} <span className={`text-xs ${weekend ? "font-medium text-brand-600" : "text-gray-400"}`}>{DOW_SHORT[d.dow]}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right">{d.cash ? formatBaht(d.cash) : "-"}</td>
                      <td className="px-3 py-1.5 text-right">{d.transfer ? formatBaht(d.transfer) : "-"}</td>
                      <td className="px-3 py-1.5 text-right">{d.creditStorefront ? formatBaht(d.creditStorefront) : "-"}</td>
                      <td className="px-3 py-1.5 text-right text-gray-700">{formatBaht(d.storefront)}</td>
                      <td className="px-3 py-1.5 text-right">{d.grab ? formatBaht(d.grab) : "-"}</td>
                      <td className="px-3 py-1.5 text-right">{d.lineman ? formatBaht(d.lineman) : "-"}</td>
                      {hasShopee && <td className="px-3 py-1.5 text-right">{d.shopee ? formatBaht(d.shopee) : "-"}</td>}
                      <td className="px-3 py-1.5 text-right font-semibold text-gray-800">{d.total ? formatBaht(d.total) : "-"}</td>
                      <td className="px-3 py-1.5 text-right text-xs text-gray-400">{d.ma7 !== null ? formatBaht(d.ma7) : "-"}</td>
                      {multi && <td className="px-3 py-1.5 text-right text-xs text-gray-400">{d.branchesWithSales}</td>}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-800">
                  <td className="px-3 py-2">รวม</td>
                  <td className="px-3 py-2 text-right">{formatBaht(r.totals.cash)}</td>
                  <td className="px-3 py-2 text-right">{formatBaht(r.totals.transfer)}</td>
                  <td className="px-3 py-2 text-right">{formatBaht(r.totals.creditStorefront)}</td>
                  <td className="px-3 py-2 text-right">{formatBaht(r.totals.storefront)}</td>
                  <td className="px-3 py-2 text-right">{formatBaht(r.totals.grab)}</td>
                  <td className="px-3 py-2 text-right">{formatBaht(r.totals.lineman)}</td>
                  {hasShopee && <td className="px-3 py-2 text-right">{formatBaht(r.totals.shopee)}</td>}
                  <td className="px-3 py-2 text-right text-brand-700">{formatBaht(r.totals.total)}</td>
                  <td className="px-3 py-2" />
                  {multi && <td className="px-3 py-2" />}
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
