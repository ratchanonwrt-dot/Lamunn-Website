import Link from "next/link";
import { formatBaht, formatPercent, formatThaiDate } from "@/lib/format";
import type { BranchDailyStat } from "@/lib/branchDailyStats";

export type AnalysisSort = "avg" | "weekday" | "weekend" | "lift" | "low" | "name";
export const ANALYSIS_SORTS: AnalysisSort[] = ["avg", "weekday", "weekend", "lift", "low", "name"];

export interface AnalysisParams {
  year: number;
  month: number;
  from: string; // YYYY-MM-DD
  to: string;
  low: number;
  div: number;
  sort: AnalysisSort;
  /** ช่วงสำเร็จรูปสำหรับปุ่มลัด */
  presets: { label: string; from: string; to: string }[];
}

const nf0 = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });

function shortDate(iso: string) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

function Lift({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-gray-400">-</span>;
  const up = value >= 0;
  return (
    <span className={`text-xs font-medium ${up ? "text-emerald-600" : "text-red-600"}`}>
      {up ? "▲" : "▼"} {formatPercent(Math.abs(value))}
    </span>
  );
}

/** เฉลี่ยต่อวัน + บรรทัดเล็ก "÷ ตัวหาร" ใต้ตัวเลข */
function AvgCell({ avg, days, div, strong }: { avg: number; days: number; div: number; strong?: boolean }) {
  if (days === 0) return <span className="text-gray-300">-</span>;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className={strong ? "font-semibold text-gray-800" : "text-gray-700"}>{formatBaht(avg)}</span>
      <span className="text-[11px] text-gray-400">
        ÷{nf0.format(div)} ≈ {nf0.format(avg / div)}
      </span>
    </span>
  );
}

export default function BranchDailyAnalysis({ stats, p }: { stats: BranchDailyStat[]; p: AnalysisParams }) {
  const sorters: Record<AnalysisSort, (a: BranchDailyStat, b: BranchDailyStat) => number> = {
    avg: (a, b) => b.all.avg - a.all.avg,
    weekday: (a, b) => b.weekday.avg - a.weekday.avg,
    weekend: (a, b) => b.weekend.avg - a.weekend.avg,
    lift: (a, b) => (b.weekendLift ?? -Infinity) - (a.weekendLift ?? -Infinity),
    low: (a, b) => b.lowDates.length - a.lowDates.length || a.all.avg - b.all.avg,
    name: (a, b) => a.branch.name.localeCompare(b.branch.name, "th"),
  };
  const rows = [...stats].sort(sorters[p.sort]);
  const withLow = [...stats].filter((s) => s.lowDates.length > 0).sort(sorters.low);
  const avgBelow = stats.filter((s) => s.all.avg < p.low).length;

  const qs = (over: Partial<Record<"aFrom" | "aTo" | "low" | "div" | "aSort", string>>) => {
    const u = new URLSearchParams({
      year: String(p.year),
      month: String(p.month),
      aFrom: p.from,
      aTo: p.to,
      low: String(p.low),
      div: String(p.div),
      aSort: p.sort,
      ...over,
    });
    return `/reports?${u.toString()}#branch-analysis`;
  };
  const sortLink = (key: AnalysisSort, label: string, align: "left" | "right" = "right") => (
    <Link href={qs({ aSort: key })} scroll={false} className={`inline-flex items-center gap-1 hover:text-brand-600 ${p.sort === key ? "font-semibold text-brand-700" : ""} ${align === "right" ? "justify-end" : ""}`}>
      {label}
      {p.sort === key && <span className="text-[10px]">▼</span>}
    </Link>
  );

  return (
    <div>
      {/* ฟอร์ม GET ธรรมดา — ค่าทุกตัวอยู่ใน URL กดย้อนกลับ/ส่งลิงก์ให้คนอื่นแล้วเห็นแบบเดียวกัน */}
      <form action="/reports" method="get" className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm">
        <input type="hidden" name="year" value={p.year} />
        <input type="hidden" name="month" value={p.month} />
        <input type="hidden" name="aSort" value={p.sort} />
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          ตั้งแต่
          <input type="date" name="aFrom" defaultValue={p.from} className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-800" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          ถึง
          <input type="date" name="aTo" defaultValue={p.to} className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-800" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          ยอดต่ำกว่า (บาท/วัน)
          <input type="number" name="low" min={0} step={100} defaultValue={p.low} className="w-28 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-right text-sm text-gray-800" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          หารด้วย
          <input type="number" name="div" min={1} step="any" defaultValue={p.div} className="w-24 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-right text-sm text-gray-800" />
        </label>
        <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          ดูผล
        </button>
        <div className="flex flex-wrap gap-1.5">
          {p.presets.map((pr) => {
            const active = pr.from === p.from && pr.to === p.to;
            return (
              <Link
                key={pr.label}
                href={qs({ aFrom: pr.from, aTo: pr.to })}
                scroll={false}
                className={`rounded-full border px-3 py-1 text-xs ${active ? "border-brand-300 bg-brand-50 font-medium text-brand-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
              >
                {pr.label}
              </Link>
            );
          })}
        </div>
      </form>
      <p className="mb-4 text-xs text-gray-400">
        ช่วง {formatThaiDate(new Date(`${p.from}T00:00:00Z`))} – {formatThaiDate(new Date(`${p.to}T00:00:00Z`))} · ยอด = หน้าร้าน + Grab + Lineman · นับเฉพาะวันที่มียอด
        (วันยอด 0 = ไม่ได้เปิดหรือยังไม่ส่งยอด ไม่นับ) · ค่าเริ่มต้นไม่รวมวันนี้ เพราะยอดวันนี้ยังเข้าไม่ครบ
      </p>

      {stats.length === 0 ? (
        <p className="text-sm text-gray-400">ไม่มีสาขาที่มียอดในช่วงนี้</p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3">
              <p className="mb-2 text-xs font-semibold text-rose-800">
                สาขาที่มีวันยอดต่ำกว่า {formatBaht(p.low)} บาท — {withLow.length} สาขา
                {avgBelow > 0 && <span className="font-normal text-rose-700"> (เฉลี่ยทั้งช่วงต่ำกว่าเกณฑ์ {avgBelow} สาขา)</span>}
              </p>
              {withLow.length === 0 ? (
                <p className="text-xs text-rose-700">ไม่มีสาขาไหนมีวันยอดต่ำกว่าเกณฑ์</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {withLow.map((s) => (
                    <li key={s.branch.id} className="flex items-start justify-between gap-3 rounded-md bg-white px-2.5 py-1.5">
                      <span className="text-gray-800">
                        {s.branch.name}
                        <span className="block text-[11px] text-gray-400">
                          {s.lowDates.length > 8 ? `${s.lowDates.slice(0, 8).map(shortDate).join(", ")} …` : s.lowDates.map(shortDate).join(", ")}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-xs">
                        <span className="font-semibold text-rose-700">{s.lowDates.length}</span>
                        <span className="text-gray-400"> / {s.all.days} วัน</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-500">
              <p className="mb-2 font-semibold text-gray-700">อ่านตารางยังไง</p>
              <ul className="list-disc space-y-1 pl-4">
                <li>เฉลี่ย/วัน = ยอดรวม ÷ จำนวนวันที่มียอดจริงของสาขานั้น</li>
                <li>วันธรรมดา = จันทร์–ศุกร์, ส-อา = เสาร์–อาทิตย์ แยกเฉลี่ยกันคนละกลุ่ม</li>
                <li>&ldquo;ส-อา เทียบวันธรรมดา&rdquo; บอกว่าวันหยุดขายดีกว่าวันธรรมดากี่ % — ใช้ดูว่าควรเพิ่มคนวันหยุดไหม</li>
                <li>
                  ตัวเลขเล็กใต้ยอดเฉลี่ย = ยอดเฉลี่ย ÷ {nf0.format(p.div)} (เปลี่ยนตัวหารได้ในช่อง &ldquo;หารด้วย&rdquo;)
                </li>
                <li>กดหัวคอลัมน์เพื่อเรียงลำดับ</li>
              </ul>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">{sortLink("name", "สาขา", "left")}</th>
                  <th className="px-3 py-2 text-right">วันที่มียอด</th>
                  <th className="px-3 py-2 text-right">{sortLink("avg", "เฉลี่ย/วัน (ทุกวัน)")}</th>
                  <th className="px-3 py-2 text-right">{sortLink("weekday", "เฉลี่ยวันธรรมดา")}</th>
                  <th className="px-3 py-2 text-right">{sortLink("weekend", "เฉลี่ย ส-อา")}</th>
                  <th className="px-3 py-2 text-right">{sortLink("lift", "ส-อา เทียบวันธรรมดา")}</th>
                  <th className="px-3 py-2 text-right">{sortLink("low", `วัน < ${nf0.format(p.low)}`)}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => (
                  <tr key={s.branch.id} className={`border-t border-gray-100 ${s.all.avg < p.low ? "bg-rose-50/40" : ""}`}>
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-gray-800">
                      {s.branch.name}
                      <span className="ml-1.5 text-[11px] font-normal text-gray-400">{s.branch.type === "CREDIT_TERM" ? "Credit Term" : "เงินสด"}</span>
                      {!s.branch.isActive && <span className="ml-1 text-[11px] font-normal text-gray-400">(ปิด)</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-gray-500">
                      {s.all.days}
                      <span className="block text-[11px] text-gray-400">
                        ธ {s.weekday.days} · ส-อา {s.weekend.days}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <AvgCell avg={s.all.avg} days={s.all.days} div={p.div} strong />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <AvgCell avg={s.weekday.avg} days={s.weekday.days} div={p.div} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <AvgCell avg={s.weekend.avg} days={s.weekend.days} div={p.div} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Lift value={s.weekendLift} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {s.lowDates.length > 0 ? (
                        <span className="font-semibold text-rose-700">{s.lowDates.length}</span>
                      ) : (
                        <span className="text-gray-300">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
