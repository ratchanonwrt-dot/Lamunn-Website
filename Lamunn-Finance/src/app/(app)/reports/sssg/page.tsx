import { Suspense } from "react";
import Link from "next/link";
import { requireSectionPage } from "@/lib/permissions";
import MonthFilterBar from "@/components/MonthFilterBar";
import { monthRange } from "@/lib/dates";
import { formatBaht, formatPercent, thaiMonthLabel } from "@/lib/format";
import { loadAllSalesData } from "@/lib/reportsCalc";
import { computeSssg, type SssgBranchRow } from "@/lib/sssgCalc";

type SortKey = "change" | "avg" | "prevAvg" | "days" | "name";
const SORT_KEYS: SortKey[] = ["change", "avg", "prevAvg", "days", "name"];

function ChangeBadge({ value, size = "xs" }: { value: number | null; size?: "xs" | "lg" }) {
  if (value === null) return <span className={`${size === "lg" ? "text-lg" : "text-xs"} text-gray-400`}>-</span>;
  const up = value >= 0;
  return (
    <span className={`${size === "lg" ? "text-lg" : "text-xs"} font-semibold ${up ? "text-emerald-600" : "text-red-600"}`}>
      {up ? "▲" : "▼"} {formatPercent(Math.abs(value))}
    </span>
  );
}

function SssgSkeleton() {
  return (
    <div className="mt-6 animate-pulse">
      <div className="h-40 rounded-xl border border-gray-200 bg-white" />
      <div className="mt-6 h-96 rounded-xl border border-gray-200 bg-white" />
    </div>
  );
}

/** แท็บ SSSG แยกออกมาจากหน้ารายงาน — เทียบสาขาเดิมเดือนนี้กับเดือนก่อนแบบ "เฉลี่ยต่อวันที่เปิดจริง"
 * (วิธีคิดอยู่ใน lib/sssgCalc.ts) เลือกได้แค่เดือน ไม่ต้องเลือกวัน เพราะจำนวนวันที่ต่างกันถูกตัดออกด้วยการหารวันเปิดจริงแล้ว */
export default async function SssgPage({ searchParams }: { searchParams: { year?: string; month?: string; sort?: string } }) {
  await requireSectionPage("REPORTS");
  const now = new Date();
  const year = Number(searchParams.year) || now.getUTCFullYear();
  const month = Number(searchParams.month) || now.getUTCMonth() + 1;
  const sort: SortKey = SORT_KEYS.includes(searchParams.sort as SortKey) ? (searchParams.sort as SortKey) : "change";

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-800">SSSG — ยอดขายสาขาเดิม (Same-Store Sales Growth)</h1>
        <Link href={`/reports?year=${year}&month=${month}`} className="text-xs font-medium text-gray-400 underline-offset-2 hover:text-brand-600 hover:underline">
          ← กลับหน้ารายงาน/วิเคราะห์
        </Link>
      </div>
      <p className="mb-6 text-sm text-gray-500">
        เทียบเฉพาะสาขาที่เปิดขายทั้งเดือนนี้และเดือนก่อน โดยคิดเป็น <span className="font-medium text-gray-700">ยอดเฉลี่ยต่อวันที่เปิดจริง</span> — วันที่ยอดเป็น 0
        (ไม่ได้เปิด/ยังไม่ส่งยอด) ไม่นับ เดือนที่ยังไม่จบจึงเทียบกับเดือนก่อนเต็มเดือนได้เลย ไม่ต้องเลือกวัน
      </p>

      <MonthFilterBar basePath="/reports/sssg" year={year} month={month} />

      <Suspense fallback={<SssgSkeleton />}>
        <SssgData year={year} month={month} sort={sort} />
      </Suspense>
    </div>
  );
}

async function SssgData({ year, month, sort }: { year: number; month: number; sort: SortKey }) {
  const now = new Date();
  const { start, end } = monthRange(year, month - 1);
  const clampedEnd = end > now ? now : end;
  const prevDate = new Date(Date.UTC(year, month - 2, 1));
  const { start: prevStart, end: prevEnd } = monthRange(prevDate.getUTCFullYear(), prevDate.getUTCMonth());

  const { branches, salesRows } = await loadAllSalesData();
  const sssg = computeSssg(branches, salesRows, { start, end: clampedEnd }, { start: prevStart, end: prevEnd });

  const thisLabel = thaiMonthLabel(year, month - 1);
  const prevLabel = thaiMonthLabel(prevDate.getUTCFullYear(), prevDate.getUTCMonth());

  // เรียงเฉพาะสาขาที่เทียบได้ (มีวันเปิดจริงทั้งสองเดือน) — สาขาใหม่/ปิดแล้ว แยกไปแสดงด้านล่าง ไม่ปนในตาราง
  const sorters: Record<SortKey, (a: SssgBranchRow, b: SssgBranchRow) => number> = {
    change: (a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity),
    avg: (a, b) => b.current.avgPerDay - a.current.avgPerDay,
    prevAvg: (a, b) => b.previous.avgPerDay - a.previous.avgPerDay,
    days: (a, b) => b.current.openDays - a.current.openDays || b.previous.openDays - a.previous.openDays,
    name: (a, b) => a.branch.name.localeCompare(b.branch.name, "th"),
  };
  const rows = [...sssg.comparable].sort(sorters[sort]);
  const up = rows.filter((r) => (r.change ?? 0) > 0).length;
  const down = rows.filter((r) => (r.change ?? 0) < 0).length;

  const sortLink = (key: SortKey, label: string, align: "left" | "right" = "right") => (
    <Link
      href={`/reports/sssg?year=${year}&month=${month}&sort=${key}`}
      className={`inline-flex items-center gap-1 hover:text-brand-600 ${sort === key ? "font-semibold text-brand-700" : ""} ${align === "right" ? "justify-end" : ""}`}
    >
      {label}
      {sort === key && <span className="text-[10px]">▼</span>}
    </Link>
  );

  const channels = [
    ["หน้าร้าน", sssg.current.avgChannel.storefront, sssg.previous.avgChannel.storefront, sssg.channelChange.storefront],
    ["Grab", sssg.current.avgChannel.grab, sssg.previous.avgChannel.grab, sssg.channelChange.grab],
    ["Lineman", sssg.current.avgChannel.lineman, sssg.previous.avgChannel.lineman, sssg.channelChange.lineman],
    ...(sssg.current.avgChannel.shopee || sssg.previous.avgChannel.shopee ? ([["Shopee", sssg.current.avgChannel.shopee, sssg.previous.avgChannel.shopee, sssg.channelChange.shopee]] as const) : []),
  ] as const;

  return (
    <>
      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="mb-1 text-sm font-semibold text-amber-800">
          สาขาเดิม {sssg.comparable.length} สาขา — {thisLabel} vs {prevLabel}
        </h2>
        <p className="mb-4 text-xs text-amber-700">ยอดเฉลี่ยต่อวันที่เปิดจริง รวมทุกสาขาเดิม (ยอดขึ้น {up} สาขา · ยอดตก {down} สาขา)</p>
        {sssg.comparable.length === 0 ? (
          <p className="text-sm text-gray-500">ไม่มีสาขาที่มีวันเปิดขายทั้งสองเดือน</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-amber-200 bg-white p-4 sm:col-span-1">
              <p className="text-xs text-gray-500">รวมเฉลี่ย/วัน — {thisLabel}</p>
              <p className="mt-1 text-2xl font-bold text-gray-800">{formatBaht(sssg.current.avgPerDay)}</p>
              <ChangeBadge value={sssg.change} size="lg" />
              <p className="mt-1 text-xs text-gray-400">
                {prevLabel}: {formatBaht(sssg.previous.avgPerDay)} / วัน
              </p>
              <p className="mt-2 border-t border-amber-100 pt-2 text-[11px] text-gray-400">
                นับวันเปิดจริงรวม {sssg.current.openDays} สาขา-วัน เทียบ {sssg.previous.openDays} สาขา-วัน
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-white p-4 sm:col-span-2">
              <p className="mb-2 text-xs text-gray-500">แยกช่องทาง (เฉลี่ย/วันที่เปิดจริง รวมสาขาเดิม)</p>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-gray-400">
                  <tr>
                    <th className="py-1 font-normal">ช่องทาง</th>
                    <th className="py-1 text-right font-normal">{prevLabel}</th>
                    <th className="py-1 text-right font-normal">{thisLabel}</th>
                    <th className="py-1 text-right font-normal">เปลี่ยนแปลง</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map(([label, cur, prev, change]) => (
                    <tr key={label} className="border-t border-amber-100">
                      <td className="py-1.5 text-gray-600">{label}</td>
                      <td className="py-1.5 text-right text-gray-400">{formatBaht(prev)}</td>
                      <td className="py-1.5 text-right font-medium text-gray-800">{formatBaht(cur)}</td>
                      <td className="py-1.5 text-right">
                        <ChangeBadge value={change} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {(sssg.newBranches.length > 0 || sssg.closedBranches.length > 0) && (
          <div className="mt-3 flex flex-col gap-1 text-[11px]">
            {sssg.newBranches.length > 0 && (
              <p className="text-amber-700">
                ไม่รวมสาขาที่ {prevLabel} ยังไม่มีวันเปิด {sssg.newBranches.length} สาขา:{" "}
                {sssg.newBranches.map((r) => `${r.branch.name} (${thisLabel} เปิด ${r.current.openDays} วัน เฉลี่ย ${formatBaht(r.current.avgPerDay)}/วัน)`).join(", ")}
              </p>
            )}
            {sssg.closedBranches.length > 0 && (
              <p className="text-gray-400">
                ไม่รวมสาขาที่ {thisLabel} ไม่มีวันเปิดเลย {sssg.closedBranches.length} สาขา: {sssg.closedBranches.map((r) => r.branch.name).join(", ")}
              </p>
            )}
          </div>
        )}
      </div>

      <h2 className="mb-1 text-sm font-semibold text-gray-700">รายสาขา — กดหัวตารางเพื่อเรียง</h2>
      <p className="mb-3 text-xs text-gray-400">ทุกตัวเลขคิดจากวันที่เปิดจริงของสาขานั้นเท่านั้น สาขาที่เปิดไม่ครบเดือนจึงเทียบได้ตรงกับสาขาที่เปิดเต็มเดือน</p>

      {/* มือถือ: การ์ด */}
      <div className="flex flex-col gap-2 sm:hidden">
        {rows.map((r, i) => (
          <div key={r.branch.id} className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium text-gray-800">
                <span className="text-xs text-gray-400">#{i + 1}</span>
                {r.branch.name}
                {!r.branch.isActive && <span className="text-xs font-normal text-gray-400">(ปิด)</span>}
              </span>
              <ChangeBadge value={r.change} />
            </div>
            <div className="mt-1 flex items-baseline justify-between text-sm">
              <span className="font-semibold text-gray-800">{formatBaht(r.current.avgPerDay)}/วัน</span>
              <span className="text-xs text-gray-400">เดือนก่อน {formatBaht(r.previous.avgPerDay)}/วัน</span>
            </div>
            <p className="mt-0.5 text-[11px] text-gray-400">
              เปิดจริง {r.current.openDays} วัน (เดือนก่อน {r.previous.openDays} วัน) · ยอดรวมเดือนนี้ {formatBaht(r.current.total)}
            </p>
          </div>
        ))}
      </div>

      {/* จอใหญ่: ตาราง */}
      <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white sm:block">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">{sortLink("name", "สาขา", "left")}</th>
              <th className="px-3 py-2 text-right">{sortLink("days", "วันเปิดจริง (นี้ / ก่อน)")}</th>
              <th className="px-3 py-2 text-right">ยอดรวม {thisLabel}</th>
              <th className="px-3 py-2 text-right">{sortLink("prevAvg", `เฉลี่ย/วัน ${prevLabel}`)}</th>
              <th className="px-3 py-2 text-right">{sortLink("avg", `เฉลี่ย/วัน ${thisLabel}`)}</th>
              <th className="px-3 py-2 text-right">{sortLink("change", "เปลี่ยนแปลง")}</th>
              <th className="px-3 py-2 text-right">หน้าร้าน / Grab / Lineman</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.branch.id} className="border-t border-gray-100">
                <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                <td className="px-3 py-2 font-medium text-gray-800">
                  {r.branch.name}
                  {!r.branch.isActive && <span className="ml-1.5 text-xs font-normal text-gray-400">(ปิดสาขาแล้ว)</span>}
                </td>
                <td className="px-3 py-2 text-right text-gray-500">
                  {r.current.openDays} / {r.previous.openDays}
                </td>
                <td className="px-3 py-2 text-right text-gray-500">{formatBaht(r.current.total)}</td>
                <td className="px-3 py-2 text-right text-gray-500">{formatBaht(r.previous.avgPerDay)}</td>
                <td className="px-3 py-2 text-right font-medium text-gray-800">{formatBaht(r.current.avgPerDay)}</td>
                <td className="px-3 py-2 text-right">
                  <ChangeBadge value={r.change} />
                </td>
                <td className="px-3 py-2 text-right text-xs">
                  <span className="inline-flex gap-2">
                    <ChangeBadge value={r.comparable ? pctOf(r.current.avgChannel.storefront, r.previous.avgChannel.storefront) : null} />
                    <ChangeBadge value={r.comparable ? pctOf(r.current.avgChannel.grab, r.previous.avgChannel.grab) : null} />
                    <ChangeBadge value={r.comparable ? pctOf(r.current.avgChannel.lineman, r.previous.avgChannel.lineman) : null} />
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-gray-400" colSpan={8}>
                  ไม่มีสาขาที่เทียบได้ในเดือนนี้
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function pctOf(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}
