import Link from "next/link";
import clsx from "clsx";
import { prisma } from "@lamunn/db-live";
import { requirePageRole } from "@/lib/requirePageRole";
import { EDITOR_ROLES } from "@/lib/requireStaff";
import { getPaySettings } from "@/lib/paySettings";
import { buildProfitReport, type ProfitReport } from "@/lib/profit";
import ProfitSettingsForm from "@/components/ProfitSettingsForm";
import { ProfitSummary, ProfitHourList, ProfitDayList, WorthBadge, baht } from "@/components/ProfitParts";
import { analyze, toRows, DOW_LABEL, type StreamerStat } from "@/lib/analytics";
import { parseDateOnly } from "@/lib/validation";
import { formatBaht, formatHours, formatNum, thaiDaysShort } from "@/lib/format";
import AnalysisFilters from "@/components/AnalysisFilters";
import BarChart from "@/components/charts/BarChart";
import Heatmap from "@/components/charts/Heatmap";

function todayTH(): Date {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function IndexBadge({ s }: { s: StreamerStat }) {
  if (s.index === null) return <span className="text-xs text-stone-300">เทียบไม่ได้</span>;
  const pct = Math.round((s.index - 1) * 100);
  const tone = s.index >= 1.15 ? "bg-emerald-100 text-emerald-700" : s.index <= 0.85 ? "bg-red-100 text-red-700" : "bg-stone-100 text-muted";
  return (
    <span className={clsx("inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", tone)} title={`คนดูจริง ${formatNum(s.avgViewers)} เทียบกับที่ช่วงเวลาเดียวกันมักได้ ${formatNum(s.expectedViewers)}`}>
      {pct > 0 ? "+" : ""}
      {pct}%
    </span>
  );
}

function Meter({ label, value, hint }: { label: string; value: number; hint: string }) {
  const pct = Math.round(value * 100);
  return (
    <div title={hint}>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium text-ink/80">{label}</span>
        <span className="tabular-nums text-ink">{pct}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-stone-100">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function AnalysisPage({ searchParams }: { searchParams: { from?: string; to?: string; channel?: string } }) {
  const me = await requirePageRole();
  // ตัวเลขเงิน (ค่าจ้าง/กำไร) เห็นเฉพาะผู้จัดการขึ้นไป — พนักงานเห็นเฉพาะส่วนวิเคราะห์คนดู/ยอดขาย
  const canSeeMoney = EDITOR_ROLES.includes(me.role);

  const today = todayTH();
  const to = parseDateOnly(searchParams.to) ?? today;
  const from = parseDateOnly(searchParams.from) ?? new Date(to.getTime() - 29 * 86400000);
  const channelId = searchParams.channel ?? "";

  const [channels, slots] = await Promise.all([
    prisma.channel.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.liveSlot.findMany({
      where: { session: { date: { gte: from, lte: to }, ...(channelId ? { channelId } : {}) } },
      include: { streamer: true, session: { include: { channel: true } } },
    }),
  ]);

  // กำไร: คิดจากกะในช่วงเดียวกัน (ช่องทางเดียวกันถ้าเลือก)
  let rep: ProfitReport | null = null;
  let settings: Awaited<ReturnType<typeof getPaySettings>> | null = null;
  if (canSeeMoney) {
    const dayCount = Math.min(370, Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1));
    const days = Array.from({ length: dayCount }, (_, i) => new Date(from.getTime() + i * 86400000));
    const [st, shifts] = await Promise.all([
      getPaySettings(),
      prisma.liveShift.findMany({
        where: { date: { gte: from, lte: to }, ...(channelId ? { channelId } : {}) },
        include: {
          streamer: { select: { name: true } },
          channel: { select: { name: true } },
          slots: { select: { startTime: true, endTime: true, sales: true } },
          orderLines: { select: { quantity: true, unitCost: true } },
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      }),
    ]);
    settings = st;
    rep = buildProfitReport(
      shifts.map((s) => ({ id: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime, streamerId: s.streamerId, streamerName: s.streamer.name, channelName: s.channel?.name ?? null, payOverride: s.payOverride, slots: s.slots, orderCount: s.orderCount, shippingCost: s.shippingCost, orderLines: s.orderLines })),
      st,
      days,
    );
  }
  const profitByStreamer = new Map((rep?.byStreamer ?? []).map((r) => [r.key, r]));
  const profitByChannel = new Map((rep?.byChannel ?? []).map((r) => [r.key, r]));

  const rows = toRows(slots);
  const a = analyze(rows);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  // ช่วงชั่วโมงที่มีข้อมูล (ตัดหัวท้ายที่ว่างออก แต่คงช่วงกลางไว้ให้เห็นรูโหว่)
  const hourIdx = a.byHour.map((h, i) => (h.slots > 0 ? i : -1)).filter((i) => i >= 0);
  const hFirst = hourIdx.length ? Math.max(0, hourIdx[0] - 1) : 0;
  const hLast = hourIdx.length ? Math.min(23, hourIdx[hourIdx.length - 1] + 1) : 23;
  const hourRange = a.byHour.slice(hFirst, hLast + 1);
  const hourLabels = hourRange.map((h) => h.label.slice(0, 2));

  const bestHour = a.byHour.filter((h) => h.slots > 0).sort((x, y) => y.avgViewers - x.avgViewers)[0];
  const bestSalesHour = a.byHour.filter((h) => h.slots > 0).sort((x, y) => y.salesPerHour - x.salesPerHour)[0];
  const bestDow = a.byDow.filter((d) => d.slots > 0).sort((x, y) => y.avgViewers - x.avgViewers)[0];
  const topStreamer = a.byStreamer.find((s) => s.index !== null) ?? a.byStreamer[0];

  const d = a.decomposition;
  const verdict =
    d.n < 10
      ? "ข้อมูลยังน้อย (ต่ำกว่า 10 ช่วง) — บันทึกเพิ่มอีกสักสองสามรอบก่อนสรุป"
      : d.streamer > d.hour * 1.3
        ? "ยอดคนดูขึ้นกับ 'คนไลฟ์' มากกว่า 'ช่วงเวลา' — เลือกคนก่อน แล้วค่อยจัดเวลา"
        : d.hour > d.streamer * 1.3
          ? "ยอดคนดูขึ้นกับ 'ช่วงเวลา' มากกว่า 'คนไลฟ์' — จัดเวลาให้ถูกช่วงสำคัญกว่าว่าใครไลฟ์"
          : "ช่วงเวลากับคนไลฟ์มีผลพอ ๆ กัน — ดูตาราง 'คนไลฟ์ × ชั่วโมง' ด้านล่างเพื่อจับคู่ให้เหมาะ";

  const streamerRows = a.byStreamer;
  const hoursAll = Array.from({ length: hLast - hFirst + 1 }, (_, i) => hFirst + i);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">วิเคราะห์ &amp; กำไร</h1>
          <p className="text-sm text-muted">
            {canSeeMoney ? "ไลฟ์คุ้มไหม · ช่วงเวลาไหนคนดูเยอะและกำไรดี · ใครไลฟ์เก่งและคุ้ม" : "ช่วงเวลาไหนคนดูเยอะ · คนดูมาเพราะเวลาหรือเพราะคน · ใครไลฟ์เก่ง"}
          </p>
        </div>
        <p className="text-xs text-stone-400">
          {a.totals.slots} ช่วง · {a.totals.sessions} รอบ · {a.totals.days} วัน · {formatHours(a.totals.hours)}
        </p>
      </div>

      <AnalysisFilters from={fromStr} to={toStr} channelId={channelId} channels={channels.map((c) => ({ id: c.id, name: c.name }))} />

      {rep && settings && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold text-ink">กำไร — ไลฟ์คุ้มไหม</h2>
            <ProfitSettingsForm adsPct={settings.adsPct} platformFeePct={settings.platformFeePct} shippingCostPct={settings.shippingCostPct} cogsPct={settings.cogsPct} />
          </div>
          <p className="mb-3 text-xs text-muted">
            ยอดขาย − ค่า Ads − ค่าธรรมเนียม TikTok = เงินได้ · เงินได้ − ค่าจ้างคนไลฟ์ = กำไรก่อนหักค่าส่งและค่าผลิต · − ค่าขนส่ง − ค่าผลิต = กำไรจริง
            {settings.payMode === "HOURLY" && <> · ค่าจ้างเหมาชั่วโมงละ {formatBaht(settings.hourlyRate)} ฿</>}
          </p>
          <ProfitSummary rep={rep} settings={settings} />
          <h2 className="mb-3 font-display text-lg font-semibold text-ink">คนดูและยอดขาย</h2>
        </>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white p-10 text-center text-stone-400">
          ยังไม่มีข้อมูลในช่วงที่เลือก —{" "}
          <Link href="/sessions/new" className="text-brand-600 hover:underline">
            บันทึกรอบไลฟ์
          </Link>{" "}
          ก่อน แล้วกลับมาดูผลที่นี่
        </div>
      ) : (
        <>
          {/* KPI */}
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            {[
              { label: "คนดูเฉลี่ย (ถ่วงตามชั่วโมง)", value: formatNum(a.totals.avgViewers) },
              { label: "คนดูสูงสุด", value: a.totals.peakViewers === null ? "-" : formatNum(a.totals.peakViewers) },
              { label: "ยอดขายรวม", value: `${formatBaht(a.totals.totalSales)} ฿` },
              { label: "ยอดขายต่อชั่วโมง", value: `${formatBaht(a.totals.salesPerHour)} ฿` },
              { label: "ช่วงเวลาที่คนดูเยอะสุด", value: bestHour ? `${bestHour.label}` : "-", sub: bestHour ? `เฉลี่ย ${formatNum(bestHour.avgViewers)} คน` : undefined },
              { label: "คนไลฟ์เด่นสุด", value: topStreamer?.label ?? "-", sub: topStreamer?.index !== null && topStreamer ? `${topStreamer.index >= 1 ? "+" : ""}${Math.round((topStreamer.index - 1) * 100)}% เทียบช่วงเดียวกัน` : undefined },
            ].map((c) => (
              <div key={c.label} className="rounded-2xl border border-line bg-white shadow-card p-3">
                <p className="text-[11px] text-stone-400">{c.label}</p>
                <p className="mt-0.5 truncate text-lg font-semibold tabular-nums text-ink">{c.value}</p>
                {c.sub && <p className="text-[11px] text-stone-400">{c.sub}</p>}
              </div>
            ))}
          </div>

          {/* คนหรือเวลา */}
          <section className="mb-6 rounded-2xl border border-line bg-white shadow-card p-5">
            <h2 className="font-display text-[15px] font-semibold text-ink">คนดูมาเพราะ &quot;เวลา&quot; หรือเพราะ &quot;คนไลฟ์&quot;?</h2>
            <p className="mb-4 text-xs text-stone-400">
              สัดส่วนความแตกต่างของยอดคนดูระหว่างช่วงต่าง ๆ ที่แต่ละปัจจัยอธิบายได้ (ยิ่งสูงยิ่งมีผล) — คำนวณจาก {d.n} ช่วงเวลาที่บันทึกไว้
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Meter label="ช่วงเวลาของวัน (ชั่วโมง)" value={d.hour} hint="ถ้าสูง = ไลฟ์ตอนไหนสำคัญมาก" />
              <Meter label="คนไลฟ์" value={d.streamer} hint="ถ้าสูง = ใครไลฟ์สำคัญมาก" />
              <Meter label="วันในสัปดาห์" value={d.dow} hint="ถ้าสูง = วันไหนของสัปดาห์สำคัญ" />
            </div>
            <p className={clsx("mt-4 rounded-lg px-3 py-2 text-sm", d.n < 10 ? "bg-amber-50 text-amber-700" : "bg-brand-50 text-brand-800")}>{verdict}</p>
          </section>

          {/* ช่วงเวลา */}
          <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section className="rounded-2xl border border-line bg-white shadow-card p-5">
              <h2 className="font-display text-[15px] font-semibold text-ink">คนดูเฉลี่ยตามช่วงเวลา</h2>
              <p className="mb-3 text-xs text-stone-400">{bestHour ? `พีคที่ ${bestHour.label} (เฉลี่ย ${formatNum(bestHour.avgViewers)} คน จาก ${bestHour.slots} ช่วง)` : ""}</p>
              <BarChart
                data={hourRange.map((h) => ({
                  key: h.key,
                  label: h.label.slice(0, 2),
                  value: h.avgViewers,
                  empty: h.slots === 0,
                  hint: h.slots ? `${h.label}: คนดูเฉลี่ย ${formatNum(h.avgViewers)} · ${h.slots} ช่วง · ${formatHours(h.hours)} · ขาย ${formatBaht(h.totalSales)} ฿` : `${h.label}: ไม่มีข้อมูล`,
                }))}
              />
            </section>
            <section className="rounded-2xl border border-line bg-white shadow-card p-5">
              <h2 className="font-display text-[15px] font-semibold text-ink">ยอดขายต่อชั่วโมง ตามช่วงเวลา</h2>
              <p className="mb-3 text-xs text-stone-400">{bestSalesHour ? `ขายดีสุดที่ ${bestSalesHour.label} (${formatBaht(bestSalesHour.salesPerHour)} ฿/ชม.)` : ""}</p>
              <BarChart
                data={hourRange.map((h) => ({
                  key: h.key,
                  label: h.label.slice(0, 2),
                  value: h.salesPerHour,
                  empty: h.slots === 0,
                  hint: h.slots ? `${h.label}: ${formatBaht(h.salesPerHour)} ฿/ชม. · ขายรวม ${formatBaht(h.totalSales)} ฿ · ${h.slots} ช่วง` : `${h.label}: ไม่มีข้อมูล`,
                }))}
                valueFormatter={(v) => formatBaht(v)}
              />
            </section>
          </div>

          {rep && rep.byHour.length > 0 && (
            <section className="mb-6 rounded-2xl border border-line bg-white p-5 shadow-card">
              <h2 className="font-display text-[15px] font-semibold text-ink">กำไรจริงตามช่วงเวลา — ช่วงไหนคุ้ม</h2>
              <p className="mb-3 text-xs text-stone-400">รวมทุกวันในช่วงที่เลือก · ยอดขายตามที่กรอกรายชั่วโมง · ค่าจ้าง/ค่าส่ง/ค่าผลิตกระจายตามสัดส่วน</p>
              <ProfitHourList rep={rep} />
            </section>
          )}

          {/* คนไลฟ์ */}
          <section className="mb-6 rounded-2xl border border-line bg-white shadow-card p-5">
            <h2 className="font-display text-[15px] font-semibold text-ink">ใครไลฟ์เก่ง{rep ? " และคุ้ม" : ""} — เทียบกับ &quot;ช่วงเวลาเดียวกัน&quot;</h2>
            <p className="mb-3 text-xs text-stone-400">
              คอลัมน์ &quot;เทียบช่วงเดียวกัน&quot; = คนดูจริงของคนนี้ เทียบกับคนดูที่คนอื่นได้ในชั่วโมงเดียวกัน (ตัดผลของเวลาออก) — บวก = ดึงคนดูได้เกินค่าปกติของช่วงนั้น
            </p>
            <div className="overflow-x-auto">
              <table className={clsx("w-full text-sm", rep ? "min-w-[1100px]" : "min-w-[820px]")}>
                <thead className="bg-paper/70 text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-3 py-2">คนไลฟ์</th>
                    <th className="px-3 py-2 text-right">วัน</th>
                    <th className="px-3 py-2 text-right">ชั่วโมง</th>
                    <th className="px-3 py-2 text-right">คนดูเฉลี่ย</th>
                    <th className="px-3 py-2 text-right">ช่วงเดียวกันมักได้</th>
                    <th className="px-3 py-2 text-center">เทียบช่วงเดียวกัน</th>
                    <th className="px-3 py-2 text-right">สูงสุด</th>
                    <th className="px-3 py-2 text-right">ยอดขายรวม</th>
                    <th className="px-3 py-2 text-right">ขาย/ชม.</th>
                    <th className="px-3 py-2 text-right">ออเดอร์</th>
                    {rep && (
                      <>
                        <th className="px-3 py-2 text-right">ค่าจ้าง</th>
                        <th className="px-3 py-2 text-right">กำไรจริง</th>
                        <th className="px-3 py-2"></th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {streamerRows.map((s, i) => (
                    <tr key={s.key} className="border-t border-line/60">
                      <td className="px-3 py-2 font-medium text-ink">
                        <span className="mr-2 inline-block w-5 text-center text-xs text-stone-300">{i + 1}</span>
                        {s.label}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{s.days}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{formatNum(s.hours, 1)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-ink">{formatNum(s.avgViewers)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{s.comparable ? formatNum(s.expectedViewers) : "-"}</td>
                      <td className="px-3 py-2 text-center">
                        <IndexBadge s={s} />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{s.peakViewers === null ? "-" : formatNum(s.peakViewers)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink">{formatBaht(s.totalSales)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink">{formatBaht(s.salesPerHour)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{s.orders ? formatNum(s.orders) : "-"}</td>
                      {rep &&
                        (() => {
                          const p = profitByStreamer.get(s.key);
                          return p ? (
                            <>
                              <td className="px-3 py-2 text-right tabular-nums text-muted">{formatBaht(p.pay)}</td>
                              <td className={clsx("px-3 py-2 text-right tabular-nums font-semibold", p.profit >= 0 ? "text-emerald-700" : "text-red-700")}>{baht(p.profit)}</td>
                              <td className="px-3 py-2 text-right">
                                <WorthBadge profit={p.profit} />
                              </td>
                            </>
                          ) : (
                            <td colSpan={3} className="px-3 py-2 text-right text-[11px] text-stone-300">ไม่มีกะในตาราง</td>
                          );
                        })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Heatmap คนไลฟ์ x ชั่วโมง */}
          <section className="mb-6 rounded-2xl border border-line bg-white shadow-card p-5">
            <h2 className="font-display text-[15px] font-semibold text-ink">คนไลฟ์ × ช่วงเวลา (คนดูเฉลี่ย)</h2>
            <p className="mb-3 text-xs text-stone-400">ใช้จับคู่ว่าใครควรไลฟ์ช่วงไหน — สีเข้ม = คนดูเยอะ, จุด = ยังไม่เคยไลฟ์ช่วงนั้น</p>
            <Heatmap
              rowLabels={streamerRows.map((s) => s.label)}
              colLabels={hoursAll.map((h) => String(h).padStart(2, "0"))}
              cells={streamerRows.map((s) =>
                hoursAll.map((h) => {
                  const c = a.streamerHour.get(`${s.key}|${h}`);
                  return c
                    ? { value: c.avgViewers, hint: `${s.label} · ${String(h).padStart(2, "0")}:00 — คนดูเฉลี่ย ${formatNum(c.avgViewers)} · ${c.slots} ช่วง · ขาย ${formatBaht(c.totalSales)} ฿` }
                    : { value: null };
                })
              )}
            />
          </section>

          {/* วัน x ชั่วโมง + วันในสัปดาห์ */}
          <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <section className="rounded-2xl border border-line bg-white shadow-card p-5 xl:col-span-2">
              <h2 className="font-display text-[15px] font-semibold text-ink">วันในสัปดาห์ × ช่วงเวลา (คนดูเฉลี่ย)</h2>
              <p className="mb-3 text-xs text-stone-400">ดูว่าวันไหน-เวลาไหนคนดูเยอะ</p>
              <Heatmap
                rowLabels={DOW_LABEL}
                colLabels={hoursAll.map((h) => String(h).padStart(2, "0"))}
                cells={DOW_LABEL.map((_, dow) =>
                  hoursAll.map((h) => {
                    const c = a.dowHour.get(`${dow}|${h}`);
                    return c ? { value: c.avgViewers, hint: `${DOW_LABEL[dow]} ${String(h).padStart(2, "0")}:00 — คนดูเฉลี่ย ${formatNum(c.avgViewers)} · ${c.slots} ช่วง` } : { value: null };
                  })
                )}
                compact
              />
            </section>
            <section className="rounded-2xl border border-line bg-white shadow-card p-5">
              <h2 className="font-display text-[15px] font-semibold text-ink">คนดูเฉลี่ยตามวันในสัปดาห์</h2>
              <p className="mb-3 text-xs text-stone-400">{bestDow ? `ดีสุดวัน${bestDow.label} (เฉลี่ย ${formatNum(bestDow.avgViewers)} คน)` : ""}</p>
              <BarChart
                height={140}
                data={a.byDow.map((dd, i) => ({
                  key: dd.key,
                  label: thaiDaysShort[i],
                  value: dd.avgViewers,
                  empty: dd.slots === 0,
                  hint: dd.slots ? `${dd.label}: คนดูเฉลี่ย ${formatNum(dd.avgViewers)} · ${dd.slots} ช่วง · ขาย ${formatBaht(dd.totalSales)} ฿` : `${dd.label}: ไม่มีข้อมูล`,
                }))}
              />
            </section>
          </div>

          {rep && rep.total.shifts > 0 && (
            <section className="mb-6 rounded-2xl border border-line bg-white p-5 shadow-card">
              <h2 className="mb-2 font-display text-[15px] font-semibold text-ink">กำไรจริงรายวัน</h2>
              <ProfitDayList rep={rep} />
            </section>
          )}

          {/* ช่องทาง */}
          {a.byChannel.length > 1 && (
            <section className="mb-6 rounded-2xl border border-line bg-white shadow-card p-5">
              <h2 className="mb-3 font-display text-[15px] font-semibold text-ink">เทียบช่องทาง</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-paper/70 text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-3 py-2">ช่องทาง</th>
                      <th className="px-3 py-2 text-right">ชั่วโมง</th>
                      <th className="px-3 py-2 text-right">คนดูเฉลี่ย</th>
                      <th className="px-3 py-2 text-right">สูงสุด</th>
                      <th className="px-3 py-2 text-right">ยอดขายรวม</th>
                      <th className="px-3 py-2 text-right">ขาย/ชม.</th>
                      {rep && <th className="px-3 py-2 text-right">กำไรจริง</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {a.byChannel.map((c) => (
                      <tr key={c.key} className="border-t border-line/60">
                        <td className="px-3 py-2 font-medium text-ink">{c.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">{formatNum(c.hours, 1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink">{formatNum(c.avgViewers)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">{c.peakViewers === null ? "-" : formatNum(c.peakViewers)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink">{formatBaht(c.totalSales)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink">{formatBaht(c.salesPerHour)}</td>
                        {rep &&
                          (() => {
                            const p = profitByChannel.get(c.label);
                            return <td className={clsx("px-3 py-2 text-right tabular-nums font-semibold", !p ? "text-stone-300" : p.profit >= 0 ? "text-emerald-700" : "text-red-700")}>{p ? baht(p.profit) : "–"}</td>;
                          })()}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
