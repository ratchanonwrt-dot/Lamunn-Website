import Link from "next/link";
import clsx from "clsx";
import { prisma } from "@lamunn/db-live";
import { requirePageRole } from "@/lib/requirePageRole";
import { parseDateOnly } from "@/lib/validation";
import { getPaySettings } from "@/lib/paySettings";
import { computePay, applyOverride, sumPay, type PayResult } from "@/lib/pay";
import { addDays, isoDate, todayTH, toRange, weekStartOf } from "@/lib/schedule";
import { formatBaht, formatNum, formatThaiDateShort, slotHours } from "@/lib/format";
import WeekPicker from "@/components/WeekPicker";
import PaySettingsForm from "@/components/PaySettingsForm";

function pct(v: number | null): string {
  return v === null ? "-" : `${formatNum(v, 1)}%`;
}

export default async function CommissionPage({ searchParams }: { searchParams: { week?: string } }) {
  await requirePageRole();

  const today = todayTH();
  const weekStart = weekStartOf(parseDateOnly(searchParams.week) ?? today);
  const weekEnd = addDays(weekStart, 6);

  const [settings, shifts] = await Promise.all([
    getPaySettings(),
    prisma.liveShift.findMany({
      where: { date: { gte: weekStart, lte: weekEnd } },
      include: { streamer: true, channel: true, slots: true },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
  ]);

  interface ShiftRow {
    id: string;
    date: Date;
    time: string;
    channel: string;
    plannedHours: number;
    hasResults: boolean;
    pay: PayResult;
    overridden: boolean;
    computedPay: number;
    payNote: string | null;
  }
  const byStreamer = new Map<string, { name: string; hrEmployeeId: string | null; rows: ShiftRow[] }>();
  for (const s of shifts) {
    const r = toRange(s.startTime, s.endTime);
    const plannedHours = r ? (r.e - r.s) / 60 : 0;
    const actualHours = s.slots.reduce((a, sl) => a + slotHours(sl.startTime, sl.endTime), 0);
    const sales = s.slots.reduce((a, sl) => a + sl.sales, 0);
    const hasResults = s.slots.length > 0;
    const payCalc = applyOverride(computePay(sales, hasResults ? actualHours : plannedHours, settings, s.date), s.payOverride);
    const row: ShiftRow = {
      overridden: payCalc.overridden,
      computedPay: payCalc.computedPay,
      payNote: s.payNote,
      id: s.id,
      date: s.date,
      time: `${s.startTime}–${s.endTime}`,
      channel: s.channel?.name ?? "-",
      plannedHours,
      hasResults,
      pay: payCalc,
    };
    const g = byStreamer.get(s.streamerId) ?? { name: s.streamer.name, hrEmployeeId: s.streamer.hrEmployeeId, rows: [] };
    g.rows.push(row);
    byStreamer.set(s.streamerId, g);
  }
  const groups = Array.from(byStreamer.entries())
    .map(([id, g]) => ({ id, ...g, total: sumPay(g.rows.map((r) => r.pay)), pending: g.rows.filter((r) => !r.hasResults).length }))
    .sort((a, b) => b.total.pay - a.total.pay);
  const grand = sumPay(groups.map((g) => g.total));
  const pendingCount = groups.reduce((a, g) => a + g.pending, 0);
  const label = `${formatThaiDateShort(weekStart)} – ${formatThaiDateShort(weekEnd)}`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">ค่าตอบแทนคนไลฟ์ (รายสัปดาห์)</h1>
          <p className="text-sm text-muted">รวมจากกะในตารางไลฟ์ · ใช้เป็นยอดทำจ่ายรายสัปดาห์ (เตรียมส่งต่อระบบ HR)</p>
        </div>
        <WeekPicker weekStart={isoDate(weekStart)} label={label} isCurrent={isoDate(weekStart) === isoDate(weekStartOf(today))} />
      </div>

      <div className="mb-6">
        <PaySettingsForm settings={{ shippingPct: settings.shippingPct, commissionPct: settings.commissionPct, minHourly: settings.minHourly, payMode: settings.payMode, hourlyRate: settings.hourlyRate, hourlyFrom: settings.hourlyFrom ? isoDate(settings.hourlyFrom) : null }} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "ยอดขายรวมสัปดาห์", value: `${formatBaht(grand.sales)} ฿` },
          { label: "ชั่วโมงไลฟ์รวม", value: `${formatNum(grand.hours, 1)} ชม.` },
          // ช่องคอม/ขั้นต่ำแสดงเฉพาะสัปดาห์ที่ยังมีกะคิดแบบคอมมิชชั่น — สัปดาห์ที่เหมาล้วนไม่ต้องรก
          ...(grand.commission > 0 || grand.topUp > 0
            ? [
                { label: `คอมมิชชั่น ${formatNum(settings.commissionPct, 2)}%`, value: `${formatBaht(grand.commission)} ฿` },
                { label: "จ่ายเพิ่มเพื่อให้ถึงขั้นต่ำ", value: `${formatBaht(grand.topUp)} ฿`, tone: grand.topUp > 0 ? "text-amber-700" : undefined },
              ]
            : [{ label: "แบบจ่าย", value: grand.mode === "COMMISSION" ? "คอม + ขั้นต่ำ" : `เหมา ${formatBaht(settings.hourlyRate)} ฿/ชม.` }]),
          { label: "ต้องจ่ายรวม", value: `${formatBaht(grand.pay)} ฿`, strong: true },
          { label: "ค่าจ้างคิดเป็น", value: pct(grand.costPct), sub: "ของยอดขาย" },
        ].map((c: { label: string; value: string; sub?: string; strong?: boolean; tone?: string }) => (
          <div key={c.label} className="rounded-2xl border border-line bg-white shadow-card p-3">
            <p className="text-[11px] text-stone-400">{c.label}</p>
            <p className={clsx("mt-0.5 truncate text-lg font-semibold tabular-nums", c.tone ?? "text-ink", c.strong && "text-brand-700")}>{c.value}</p>
            {c.sub && <p className="text-[11px] text-stone-400">{c.sub}</p>}
          </div>
        ))}
      </div>

      {pendingCount > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          มี {pendingCount} กะที่ยังไม่ได้กรอกยอด — ตัวเลขของกะเหล่านั้นเป็นประมาณการจากชั่วโมงที่วางไว้
        </p>
      )}

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white p-10 text-center text-stone-400">
          สัปดาห์นี้ยังไม่มีกะในตาราง —{" "}
          <Link href={`/schedule?week=${isoDate(weekStart)}`} className="text-brand-600 hover:underline">
            ไปลงตารางไลฟ์
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.id} className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-paper px-4 py-3">
                <div>
                  <p className="font-semibold text-ink">
                    {g.name}
                    {g.hrEmployeeId && <span className="ml-2 rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-normal text-muted">HR: {g.hrEmployeeId}</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {g.rows.length} กะ · {formatNum(g.total.hours, 1)} ชม. · ขาย {formatBaht(g.total.sales)} ฿{g.total.commission > 0 && <> · คอม {formatBaht(g.total.commission)} ฿</>}
                    {g.total.topUp > 0 && <span className="text-amber-700"> · เพิ่มขั้นต่ำ {formatBaht(g.total.topUp)} ฿</span>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-stone-400">ต้องจ่าย</p>
                  <p className="text-xl font-bold tabular-nums text-ink">{formatBaht(g.total.pay)} ฿</p>
                  <p className="text-[11px] text-muted">= {pct(g.total.costPct)} ของยอดขาย</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="text-left text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                    <tr>
                      <th className="px-4 py-1.5 font-medium">วัน</th>
                      <th className="px-3 py-1.5 font-medium">เวลา</th>
                      <th className="px-3 py-1.5 font-medium">ช่องทาง</th>
                      <th className="px-3 py-1.5 text-right font-medium">ชม.</th>
                      <th className="px-3 py-1.5 text-right font-medium">ยอดขาย</th>
                      <th className="px-3 py-1.5 font-medium">วิธีคิด</th>
                      <th className="px-3 py-1.5 text-right font-medium">จ่าย</th>
                      <th className="px-3 py-1.5 text-right font-medium">% ของยอดขาย</th>
                      <th className="px-3 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.id} className={clsx("border-t border-line/60", !r.hasResults && "text-stone-400")}>
                        <td className="px-4 py-2 font-medium text-ink">
                          {formatThaiDateShort(r.date)}
                          {r.overridden && (
                            <span className="ml-1.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-800" title={`ระบบคำนวณได้ ${formatBaht(r.computedPay)} ฿`}>
                              กำหนดเอง
                            </span>
                          )}
                          {r.payNote && <span className="block text-[11px] font-normal text-muted">📝 {r.payNote}</span>}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{r.time}</td>
                        <td className="px-3 py-2">{r.channel}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNum(r.pay.hours, 1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.hasResults ? formatBaht(r.pay.sales) : "-"}</td>
                        <td className="px-3 py-2 text-xs text-muted">
                          {r.pay.mode === "HOURLY"
                            ? `เหมา ${formatBaht(r.pay.rate)} × ${formatNum(r.pay.hours, 1)} ชม.`
                            : r.hasResults
                              ? `คอม ${formatBaht(r.pay.commission)} / ขั้นต่ำ ${formatBaht(r.pay.minPay)}`
                              : `ขั้นต่ำ ${formatBaht(r.pay.minPay)}`}
                        </td>
                        <td className={clsx("px-3 py-2 text-right tabular-nums font-semibold", r.overridden ? "text-brand-800" : r.hasResults && r.pay.hitMinimum ? "text-amber-700" : "text-ink")}>
                          {formatBaht(r.pay.pay)}
                          {!r.overridden && r.hasResults && r.pay.mode === "COMMISSION" && r.pay.hitMinimum && <span className="ml-1 text-[10px] font-normal">ขั้นต่ำ</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.hasResults ? pct(r.pay.costPct) : "-"}</td>
                        <td className="px-3 py-2 text-right">
                          <Link href={`/shifts/${r.id}`} className="text-xs font-medium text-brand-600 hover:underline">
                            {r.hasResults ? "เปิด" : "กรอกยอด"}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
