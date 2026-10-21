import Link from "next/link";
import clsx from "clsx";
import { prisma } from "@lamunn/db-live";
import { requirePageRole } from "@/lib/requirePageRole";
import { EDITOR_ROLES } from "@/lib/requireStaff";
import { getPaySettings } from "@/lib/paySettings";
import { buildProfitReport, type ProfitTotals } from "@/lib/profit";
import { addDays, isoDate, todayTH, weekStartOf } from "@/lib/schedule";
import { parseDateOnly } from "@/lib/validation";
import { formatBaht, formatNum, formatThaiDateShort } from "@/lib/format";
import ProfitSettingsForm from "@/components/ProfitSettingsForm";

export const dynamic = "force-dynamic";

const pct = (v: number | null, d = 1) => (v === null ? "–" : `${formatNum(v, d)}%`);

/** บอกว่าตัวเลขค่าส่ง/ต้นทุนมาจากออเดอร์จริงกี่กะ ประมาณกี่กะ */
function costSource(t: ProfitTotals, detail: string | null): string {
  if (t.estimatedShifts === 0) return detail ? `จากออเดอร์จริง · ${detail}` : "จากออเดอร์จริง";
  if (t.actualShifts === 0) return "ประมาณจาก % (ยังไม่กรอกออเดอร์)";
  return `จริง ${t.actualShifts} กะ · ประมาณ ${t.estimatedShifts} กะ`;
}
const baht = (v: number) => `${v < 0 ? "−" : ""}${formatBaht(Math.abs(v))} ฿`;

/** ช่วงวันที่สำเร็จรูป — เก็บใน query string ให้กดย้อนกลับ/บุ๊กมาร์กได้ */
function presets(today: Date) {
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const lastMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const lastMonthEnd = addDays(monthStart, -1);
  const ws = weekStartOf(today);
  return [
    { key: "week", label: "สัปดาห์นี้", from: ws, to: addDays(ws, 6) },
    { key: "lastweek", label: "สัปดาห์ก่อน", from: addDays(ws, -7), to: addDays(ws, -1) },
    { key: "month", label: "เดือนนี้", from: monthStart, to: today },
    { key: "lastmonth", label: "เดือนก่อน", from: lastMonthStart, to: lastMonthEnd },
    { key: "30d", label: "30 วันล่าสุด", from: addDays(today, -29), to: today },
  ];
}

export default async function ProfitPage({ searchParams }: { searchParams: { range?: string; from?: string; to?: string } }) {
  await requirePageRole(EDITOR_ROLES);
  const today = todayTH();
  const ps = presets(today);
  const preset = ps.find((p) => p.key === (searchParams.range ?? (searchParams.from ? "" : "month")));
  const from = preset?.from ?? parseDateOnly(searchParams.from) ?? ps[2].from;
  const toRaw = preset?.to ?? parseDateOnly(searchParams.to) ?? today;
  const to = toRaw < from ? from : toRaw;
  const dayCount = Math.min(370, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
  const days = Array.from({ length: dayCount }, (_, i) => addDays(from, i));

  const [settings, shifts] = await Promise.all([
    getPaySettings(),
    prisma.liveShift.findMany({
      where: { date: { gte: from, lte: to } },
      include: {
        streamer: { select: { name: true } },
        channel: { select: { name: true } },
        slots: { select: { startTime: true, endTime: true, sales: true } },
        orderLines: { select: { quantity: true, unitCost: true } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
  ]);
  const rep = buildProfitReport(
    shifts.map((s) => ({ id: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime, streamerId: s.streamerId, streamerName: s.streamer.name, channelName: s.channel?.name ?? null, payOverride: s.payOverride, slots: s.slots, orderCount: s.orderCount, shippingCost: s.shippingCost, orderLines: s.orderLines })),
    settings,
    days,
  );
  const t = rep.total;
  const worth = t.profit > 0;
  const hasData = t.shifts > 0;

  // แท่งสัดส่วน: ยอดขาย 100% แบ่งเป็น ค่า Ads / ค่าธรรมเนียม / ค่าจ้าง / กำไร
  const share = (v: number) => (t.sales > 0 ? Math.max(0, (v / t.sales) * 100) : 0);
  const parts = [
    { label: `ค่า Ads ${formatNum(settings.adsPct, 1)}%`, value: t.ads, cls: "bg-orange-300" },
    { label: `ค่าธรรมเนียม TikTok ${formatNum(settings.platformFeePct, 1)}%`, value: t.fee, cls: "bg-amber-200" },
    { label: "ค่าจ้างคนไลฟ์", value: t.pay, cls: "bg-stone-400" },
    { label: "ค่าขนส่ง", value: t.shipping, cls: "bg-sky-300" },
    { label: "ต้นทุนวัตถุดิบ", value: t.cogs, cls: "bg-violet-300" },
    { label: t.profit >= 0 ? "กำไรจริง" : "ขาดทุน", value: Math.abs(t.profit), cls: t.profit >= 0 ? "bg-emerald-500" : "bg-red-500" },
  ];
  const maxAbsDay = Math.max(1, ...rep.byDay.map((d) => Math.abs(d.profit)));
  const maxAbsHour = Math.max(1, ...rep.byHour.map((d) => Math.abs(d.profit)));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">สรุปกำไร — ไลฟ์คุ้มไหม</h1>
          <p className="text-sm text-muted">
            ยอดขาย − ค่า Ads − ค่าธรรมเนียม TikTok = เงินได้ · เงินได้ − ค่าจ้างคนไลฟ์ − ค่าขนส่ง − ต้นทุนวัตถุดิบ = กำไรจริง
          </p>
        </div>
        <ProfitSettingsForm adsPct={settings.adsPct} platformFeePct={settings.platformFeePct} shippingCostPct={settings.shippingCostPct} cogsPct={settings.cogsPct} />
      </div>

      {/* ช่วงวันที่ */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {ps.map((p) => (
          <Link
            key={p.key}
            href={`/profit?range=${p.key}`}
            className={clsx("rounded-full border px-3 py-1.5 text-sm", preset?.key === p.key ? "border-ink bg-ink font-semibold text-white" : "border-line bg-white text-muted hover:bg-paper")}
          >
            {p.label}
          </Link>
        ))}
        <form method="get" action="/profit" className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          <input type="date" name="from" defaultValue={isoDate(from)} className="rounded-xl border border-line bg-white px-3 py-1.5 text-sm" />
          <span className="text-muted">ถึง</span>
          <input type="date" name="to" defaultValue={isoDate(to)} className="rounded-xl border border-line bg-white px-3 py-1.5 text-sm" />
          <button className="rounded-xl bg-ink px-3 py-1.5 font-semibold text-white hover:bg-brand-600">ดู</button>
        </form>
      </div>
      <p className="mb-4 text-xs text-muted">
        {formatThaiDateShort(from)} – {formatThaiDateShort(to)} · {t.shifts} กะที่กรอกยอดแล้ว · {formatNum(t.hours, 1)} ชม.
        {settings.payMode === "HOURLY" && <> · ค่าจ้างเหมาชั่วโมงละ {formatBaht(settings.hourlyRate)} ฿{settings.hourlyFrom && <> (ตั้งแต่ {formatThaiDateShort(settings.hourlyFrom)})</>}</>}
      </p>

      {hasData && t.estimatedShifts > 0 && (
        <p className={clsx("mb-4 rounded-lg border px-3 py-2 text-xs", settings.cogsPct === 0 ? "border-red-200 bg-red-50 font-medium text-red-800" : "border-amber-200 bg-amber-50 text-amber-800")}>
          {t.estimatedShifts} จาก {t.shifts} กะยังไม่กรอกออเดอร์ — ค่าขนส่งและต้นทุนวัตถุดิบของกะเหล่านั้นเป็น<b>ค่าประมาณ</b> (ขนส่ง {formatNum(settings.shippingCostPct, 1)}% · วัตถุดิบ {formatNum(settings.cogsPct, 1)}% ของยอดขาย)
          {settings.cogsPct === 0 && " ซึ่งตอนนี้วัตถุดิบเป็น 0% กำไรจึงสูงกว่าความจริง"} · กรอกออเดอร์ที่หน้ากะ (ล่างสุด) เพื่อให้ได้กำไรจริง
        </p>
      )}

      {rep.pending.shifts > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ยังไม่กรอกยอด {rep.pending.shifts} กะ ({formatNum(rep.pending.plannedHours, 1)} ชม. ค่าจ้างประมาณ {formatBaht(rep.pending.estimatedPay)} ฿) — ไม่ได้นับในตัวเลขด้านล่าง กรอกยอดในหน้ากะแล้วตัวเลขจะครบ
        </p>
      )}

      {!hasData ? (
        <div className="rounded-2xl border border-dashed border-line bg-white p-12 text-center text-muted">ยังไม่มีกะที่กรอกยอดในช่วงนี้</div>
      ) : (
        <>
          {/* คำตอบ: คุ้มไหม */}
          <section className={clsx("mb-5 rounded-2xl border p-5 shadow-card", worth ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50")}>
            <p className={clsx("text-sm font-semibold", worth ? "text-emerald-800" : "text-red-800")}>{worth ? "คุ้ม — ไลฟ์ช่วงนี้มีกำไรจริง" : "ยังไม่คุ้ม — ช่วงนี้ขาดทุน"} (หลังหักค่าจ้าง ค่าขนส่ง และต้นทุนวัตถุดิบแล้ว)</p>
            <p className={clsx("font-display text-4xl font-semibold tabular-nums", worth ? "text-emerald-700" : "text-red-700")}>{baht(t.profit)}</p>
            <p className="mt-1 text-sm text-ink/80">
              กำไร {pct(t.margin)} ของยอดขาย · ค่าจ้าง 1 บาท ได้กำไรกลับมา {t.roi === null ? "–" : `${formatNum(t.roi / 100, 2)} บาท`} · กำไรเฉลี่ย {t.profitPerHour === null ? "–" : baht(t.profitPerHour)} ต่อชั่วโมงไลฟ์
            </p>
            {rep.breakEvenSalesPerHour !== null && (
              <p className="mt-2 text-xs text-muted">
                จุดคุ้มทุน: ต้องขายได้อย่างน้อย <b className="text-ink">{formatBaht(rep.breakEvenSalesPerHour)} ฿ ต่อชั่วโมง</b> (ค่าจ้าง {formatBaht(settings.hourlyRate)} ÷ ส่วนที่เหลือหลังหักทุก % = {formatNum(rep.keepRatio * 100, 0)}% ของยอดขาย) · ตอนนี้ขายเฉลี่ย{" "}
                <b className={clsx((t.salesPerHour ?? 0) >= rep.breakEvenSalesPerHour ? "text-emerald-700" : "text-red-700")}>{t.salesPerHour === null ? "–" : `${formatBaht(t.salesPerHour)} ฿`}</b> ต่อชั่วโมง
              </p>
            )}
          </section>

          {/* ตัวเลขหลัก */}
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "ยอดขาย", value: baht(t.sales) },
              { label: `− ค่า Ads ${formatNum(settings.adsPct, 1)}%`, value: baht(-t.ads), tone: "text-orange-700" },
              { label: `− ค่าธรรมเนียม TikTok ${formatNum(settings.platformFeePct, 1)}%`, value: baht(-t.fee), tone: "text-amber-700" },
              { label: "= เงินได้", value: baht(t.income), strong: true },
              { label: "− ค่าจ้างคนไลฟ์", value: baht(-t.pay), sub: `${pct(t.sales > 0 ? (t.pay / t.sales) * 100 : null)} ของยอดขาย`, tone: "text-stone-600" },
              { label: "− ค่าขนส่ง", value: baht(-t.shipping), tone: "text-sky-700", sub: costSource(t, t.orders > 0 ? `${formatNum(t.orders)} ออเดอร์ · ${formatBaht(t.shipping / Math.max(1, t.orders))} ฿/ออเดอร์` : null) },
              { label: "− ต้นทุนวัตถุดิบ", value: baht(-t.cogs), tone: "text-violet-700", sub: costSource(t, t.sets > 0 ? `${formatNum(t.sets)} ชุด` : null) },
              { label: "= กำไรจริง", value: baht(t.profit), strong: true, tone: worth ? "text-emerald-700" : "text-red-700", sub: `${pct(t.margin)} ของยอดขาย` },
            ].map((c) => (
              <div key={c.label} className="rounded-2xl border border-line bg-white p-3 shadow-card">
                <p className="truncate text-[11px] text-stone-400">{c.label}</p>
                <p className={clsx("mt-0.5 truncate text-lg tabular-nums", c.strong ? "font-bold" : "font-semibold", c.tone ?? "text-ink")}>{c.value}</p>
                {c.sub && <p className="text-[11px] text-stone-400">{c.sub}</p>}
              </div>
            ))}
          </div>

          {/* ยอดขาย 100 บาท ไปไหนบ้าง */}
          <section className="mb-5 rounded-2xl border border-line bg-white p-4 shadow-card">
            <p className="mb-2 text-sm font-semibold text-ink">ยอดขายทุก 100 บาท ไปไหนบ้าง</p>
            <div className="flex h-7 w-full overflow-hidden rounded-lg bg-paper">
              {parts.map((p) => (
                <div key={p.label} className={clsx("h-full", p.cls)} style={{ width: `${share(p.value)}%` }} title={`${p.label}: ${baht(p.value)}`} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
              {parts.map((p) => (
                <span key={p.label} className="inline-flex items-center gap-1.5">
                  <span className={clsx("h-2.5 w-2.5 rounded-sm", p.cls)} /> {p.label} <b className="tabular-nums text-ink">{formatNum(share(p.value), 1)} ฿</b>
                </span>
              ))}
            </div>
            {t.profit < 0 && <p className="mt-2 text-xs text-red-700">ค่าใช้จ่ายรวมเกินยอดขาย {formatBaht(-t.profit)} ฿ — แท่งเกิน 100% จึงแสดงเฉพาะส่วนที่จ่ายออก</p>}
          </section>

          <div className="grid gap-5 2xl:grid-cols-2">
            {/* รายคน */}
            <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
              <header className="border-b border-line bg-paper/60 px-4 py-2.5">
                <p className="font-display text-[15px] font-semibold text-ink">รายคนไลฟ์ — ใครคุ้ม</p>
              </header>
              <TotalsTable rows={rep.byStreamer} first="คนไลฟ์" />
            </section>

            {/* รายชั่วโมงของวัน */}
            <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
              <header className="border-b border-line bg-paper/60 px-4 py-2.5">
                <p className="font-display text-[15px] font-semibold text-ink">ช่วงเวลาไหนคุ้ม (รวมทุกวันในช่วงที่เลือก)</p>
                <p className="text-[11px] text-muted">กำไรจริงรายชั่วโมง · ยอดขายตามที่กรอกรายชั่วโมง · ค่าจ้างกระจายตามชั่วโมง</p>
              </header>
              <ul className="divide-y divide-line/60 text-sm">
                {rep.byHour.map((h) => (
                  <li key={h.key} className="grid grid-cols-[56px_1fr_96px_64px] items-center gap-3 px-4 py-1.5">
                    <span className="tabular-nums text-muted">{h.label}</span>
                    <ProfitBar value={h.profit} max={maxAbsHour} />
                    <span className={clsx("text-right tabular-nums font-semibold", h.profit >= 0 ? "text-emerald-700" : "text-red-700")}>{baht(h.profit)}</span>
                    <span className="text-right text-[11px] tabular-nums text-muted">{formatNum(h.hours, 0)} ชม.</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* รายวัน */}
          <section className="mt-5 overflow-hidden rounded-2xl border border-line bg-white shadow-card">
            <header className="border-b border-line bg-paper/60 px-4 py-2.5">
              <p className="font-display text-[15px] font-semibold text-ink">กำไรจริงรายวัน</p>
            </header>
            <ul className="divide-y divide-line/60 text-sm">
              {rep.byDay.map((d) => {
                const date = new Date(d.key + "T00:00:00Z");
                return (
                  <li key={d.key} className={clsx("grid grid-cols-[92px_1fr_110px_120px] items-center gap-3 px-4 py-1.5", d.shifts === 0 && "text-stone-300")}>
                    <span className="tabular-nums">{formatThaiDateShort(date)}</span>
                    {d.shifts > 0 ? <ProfitBar value={d.profit} max={maxAbsDay} /> : <span className="text-[11px]">ไม่มีกะที่กรอกยอด</span>}
                    <span className={clsx("text-right tabular-nums font-semibold", d.shifts === 0 ? "" : d.profit >= 0 ? "text-emerald-700" : "text-red-700")}>{d.shifts ? baht(d.profit) : "–"}</span>
                    <span className="text-right text-[11px] tabular-nums text-muted">{d.shifts ? `ขาย ${formatBaht(d.sales)} · ${formatNum(d.hours, 0)} ชม.` : ""}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          {rep.byChannel.length > 1 && (
            <section className="mt-5 overflow-hidden rounded-2xl border border-line bg-white shadow-card">
              <header className="border-b border-line bg-paper/60 px-4 py-2.5">
                <p className="font-display text-[15px] font-semibold text-ink">รายช่องทาง</p>
                <p className="text-[11px] text-muted">ใช้ % ค่า Ads ค่าธรรมเนียม ค่าขนส่ง และต้นทุนวัตถุดิบเดียวกันทุกช่องทาง</p>
              </header>
              <TotalsTable rows={rep.byChannel} first="ช่องทาง" />
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** แท่งกำไร/ขาดทุน: กำไรไปทางขวา (เขียว) ขาดทุนไปทางซ้าย (แดง) จากเส้นกึ่งกลาง */
function ProfitBar({ value, max }: { value: number; max: number }) {
  const w = Math.min(50, (Math.abs(value) / max) * 50);
  return (
    <div className="relative h-3 rounded bg-paper">
      <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
      <div className={clsx("absolute inset-y-0 rounded", value >= 0 ? "left-1/2 bg-emerald-500" : "right-1/2 bg-red-500")} style={{ width: `${w}%` }} />
    </div>
  );
}

function TotalsTable({ rows, first }: { rows: (ProfitTotals & { key: string; label: string })[]; first: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-[11px] font-semibold uppercase tracking-wider text-stone-400">
          <tr>
            <th className="px-4 py-2 font-medium">{first}</th>
            <th className="px-3 py-2 text-right font-medium">ชม.</th>
            <th className="px-3 py-2 text-right font-medium">ยอดขาย</th>
            <th className="px-3 py-2 text-right font-medium">ขาย/ชม.</th>
            <th className="px-3 py-2 text-right font-medium">ค่าจ้าง</th>
            <th className="px-3 py-2 text-right font-medium">กำไรจริง</th>
            <th className="px-3 py-2 text-right font-medium">%กำไร</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-line/60">
              <td className="px-4 py-2 font-medium text-ink">
                {r.label}
                <span className="ml-1 text-[11px] font-normal text-stone-400">{r.shifts} กะ</span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-muted">{formatNum(r.hours, 1)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatBaht(r.sales)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted">{r.salesPerHour === null ? "–" : formatBaht(r.salesPerHour)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted">{formatBaht(r.pay)}</td>
              <td className={clsx("px-3 py-2 text-right tabular-nums font-semibold", r.profit >= 0 ? "text-emerald-700" : "text-red-700")}>{baht(r.profit)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted">{pct(r.margin)}</td>
              <td className="px-3 py-2 text-right">
                <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-medium", r.profit > 0 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800")}>{r.profit > 0 ? "คุ้ม" : "ไม่คุ้ม"}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
