import clsx from "clsx";
import type { ProfitReport, ProfitTotals } from "@/lib/profit";
import { formatBaht, formatNum, formatThaiDateShort } from "@/lib/format";

/** ส่วนแสดงกำไร (server component) — ใช้ในหน้า "วิเคราะห์ & กำไร" */

export const pct = (v: number | null, d = 1) => (v === null ? "–" : `${formatNum(v, d)}%`);
export const baht = (v: number) => `${v < 0 ? "−" : ""}${formatBaht(Math.abs(v))} ฿`;

interface Rates {
  adsPct: number;
  platformFeePct: number;
  shippingCostPct: number;
  cogsPct: number;
  payMode: string;
  hourlyRate: number;
}

/** บอกว่าตัวเลขค่าส่ง/ต้นทุนมาจากออเดอร์จริงกี่กะ ประมาณกี่กะ */
function costSource(t: ProfitTotals, detail: string | null): string {
  if (t.estimatedShifts === 0) return detail ? `จากออเดอร์จริง · ${detail}` : "จากออเดอร์จริง";
  if (t.actualShifts === 0) return "ประมาณจาก % (ยังไม่กรอกออเดอร์)";
  return `จริง ${t.actualShifts} กะ · ประมาณ ${t.estimatedShifts} กะ`;
}

/** แท่งกำไร/ขาดทุน: กำไรไปทางขวา (เขียว) ขาดทุนไปทางซ้าย (แดง) จากเส้นกึ่งกลาง */
export function ProfitBar({ value, max }: { value: number; max: number }) {
  const w = Math.min(50, (Math.abs(value) / max) * 50);
  return (
    <div className="relative h-3 rounded bg-paper">
      <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
      <div className={clsx("absolute inset-y-0 rounded", value >= 0 ? "left-1/2 bg-emerald-500" : "right-1/2 bg-red-500")} style={{ width: `${w}%` }} />
    </div>
  );
}

/** คำตอบ "คุ้มไหม" + ตัวเลขทีละขั้น + ยอดขาย 100 บาทไปไหน */
export function ProfitSummary({ rep, settings }: { rep: ProfitReport; settings: Rates }) {
  const t = rep.total;
  const worth = t.profit > 0;
  const share = (v: number) => (t.sales > 0 ? Math.max(0, (v / t.sales) * 100) : 0);
  const parts = [
    { label: `ค่า Ads ${formatNum(settings.adsPct, 1)}%`, value: t.ads, cls: "bg-orange-300" },
    { label: `ค่าธรรมเนียม TikTok ${formatNum(settings.platformFeePct, 1)}%`, value: t.fee, cls: "bg-amber-200" },
    { label: "ค่าจ้างคนไลฟ์", value: t.pay, cls: "bg-stone-400" },
    { label: "ค่าขนส่ง", value: t.shipping, cls: "bg-sky-300" },
    { label: "ค่าผลิต", value: t.cogs, cls: "bg-violet-300" },
    { label: t.profit >= 0 ? "กำไรจริง" : "ขาดทุน", value: Math.abs(t.profit), cls: t.profit >= 0 ? "bg-emerald-500" : "bg-red-500" },
  ];

  return (
    <>
      {t.shifts > 0 && t.estimatedShifts > 0 && (
        <p className={clsx("mb-4 rounded-lg border px-3 py-2 text-xs", settings.cogsPct === 0 ? "border-red-200 bg-red-50 font-medium text-red-800" : "border-amber-200 bg-amber-50 text-amber-800")}>
          {t.estimatedShifts} จาก {t.shifts} กะยังไม่กรอกออเดอร์ — ค่าขนส่งและค่าผลิตของกะเหล่านั้นเป็น<b>ค่าประมาณ</b> (ขนส่ง {formatNum(settings.shippingCostPct, 1)}% · วัตถุดิบ {formatNum(settings.cogsPct, 1)}% ของยอดขาย)
          {settings.cogsPct === 0 && " ซึ่งตอนนี้วัตถุดิบเป็น 0% กำไรจึงสูงกว่าความจริง"} · กรอกออเดอร์ที่หน้ากะ (ล่างสุด) เพื่อให้ได้กำไรจริง
        </p>
      )}
      {rep.pending.shifts > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ยังไม่กรอกยอด {rep.pending.shifts} กะ ({formatNum(rep.pending.plannedHours, 1)} ชม. ค่าจ้างประมาณ {formatBaht(rep.pending.estimatedPay)} ฿) — ไม่ได้นับในตัวเลขกำไร กรอกยอดในหน้ากะแล้วตัวเลขจะครบ
        </p>
      )}

      {t.shifts === 0 ? (
        <div className="mb-6 rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-muted">ยังไม่มีกะที่กรอกยอดในช่วงนี้ — ยังคิดกำไรไม่ได้</div>
      ) : (
        <>
          <section className={clsx("mb-5 rounded-2xl border p-5 shadow-card", worth ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50")}>
            <p className={clsx("text-sm font-semibold", worth ? "text-emerald-800" : "text-red-800")}>{worth ? "คุ้ม — ไลฟ์ช่วงนี้มีกำไรจริง" : "ยังไม่คุ้ม — ช่วงนี้ขาดทุน"} (หลังหักค่าจ้าง ค่าขนส่ง และค่าผลิตแล้ว)</p>
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

          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
            {[
              { label: "ยอดขาย", value: baht(t.sales) },
              { label: `− ค่า Ads ${formatNum(settings.adsPct, 1)}%`, value: baht(-t.ads), tone: "text-orange-700" },
              { label: `− ค่าธรรมเนียม TikTok ${formatNum(settings.platformFeePct, 1)}%`, value: baht(-t.fee), tone: "text-amber-700" },
              { label: "= เงินได้", value: baht(t.income), strong: true },
              { label: "− ค่าจ้างคนไลฟ์", value: baht(-t.pay), sub: `${pct(t.sales > 0 ? (t.pay / t.sales) * 100 : null)} ของยอดขาย`, tone: "text-stone-600" },
              // ขั้นกลางที่เจ้าของใช้ดู: หักแค่ค่าการตลาด/แพลตฟอร์ม/คนไลฟ์ ยังไม่หักค่าส่งและค่าผลิต
              { label: "= กำไรก่อนหักค่าส่งและค่าผลิต", value: baht(t.income - t.pay), strong: true, sub: `${pct(t.sales > 0 ? ((t.income - t.pay) / t.sales) * 100 : null)} ของยอดขาย` },
              { label: "− ค่าขนส่ง", value: baht(-t.shipping), tone: "text-sky-700", sub: costSource(t, t.orders > 0 ? `${formatNum(t.orders)} ออเดอร์ · ${formatBaht(t.shipping / Math.max(1, t.orders))} ฿/ออเดอร์` : null) },
              { label: "− ค่าผลิต (ต้นทุนวัตถุดิบ)", value: baht(-t.cogs), tone: "text-violet-700", sub: costSource(t, t.sets > 0 ? `${formatNum(t.sets)} ชุด` : null) },
              { label: "= กำไรจริง", value: baht(t.profit), strong: true, tone: worth ? "text-emerald-700" : "text-red-700", sub: `${pct(t.margin)} ของยอดขาย` },
            ].map((c: { label: string; value: string; sub?: string; strong?: boolean; tone?: string }) => (
              <div key={c.label} className="rounded-2xl border border-line bg-white p-3 shadow-card">
                <p className="truncate text-[11px] text-stone-400">{c.label}</p>
                <p className={clsx("mt-0.5 truncate text-lg tabular-nums", c.strong ? "font-bold" : "font-semibold", c.tone ?? "text-ink")}>{c.value}</p>
                {c.sub && <p className="text-[11px] text-stone-400">{c.sub}</p>}
              </div>
            ))}
          </div>

          <section className="mb-6 rounded-2xl border border-line bg-white p-4 shadow-card">
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
        </>
      )}
    </>
  );
}

/** กำไรจริงตามช่วงเวลาของวัน */
export function ProfitHourList({ rep }: { rep: ProfitReport }) {
  const max = Math.max(1, ...rep.byHour.map((d) => Math.abs(d.profit)));
  return (
    <ul className="divide-y divide-line/60 text-sm">
      {rep.byHour.map((h) => (
        <li key={h.key} className="grid grid-cols-[56px_1fr_96px_64px] items-center gap-3 py-1.5">
          <span className="tabular-nums text-muted">{h.label}</span>
          <ProfitBar value={h.profit} max={max} />
          <span className={clsx("text-right tabular-nums font-semibold", h.profit >= 0 ? "text-emerald-700" : "text-red-700")}>{baht(h.profit)}</span>
          <span className="text-right text-[11px] tabular-nums text-muted">{formatNum(h.hours, 0)} ชม.</span>
        </li>
      ))}
      {rep.byHour.length === 0 && <li className="py-4 text-center text-xs text-stone-400">ยังไม่มีข้อมูล</li>}
    </ul>
  );
}

/** กำไรจริงรายวัน */
export function ProfitDayList({ rep }: { rep: ProfitReport }) {
  const max = Math.max(1, ...rep.byDay.map((d) => Math.abs(d.profit)));
  return (
    <ul className="divide-y divide-line/60 text-sm">
      {rep.byDay.map((d) => {
        const date = new Date(d.key + "T00:00:00Z");
        return (
          <li key={d.key} className={clsx("grid grid-cols-[92px_1fr_110px_140px] items-center gap-3 py-1.5", d.shifts === 0 && "text-stone-300")}>
            <span className="tabular-nums">{formatThaiDateShort(date)}</span>
            {d.shifts > 0 ? <ProfitBar value={d.profit} max={max} /> : <span className="text-[11px]">ไม่มีกะที่กรอกยอด</span>}
            <span className={clsx("text-right tabular-nums font-semibold", d.shifts === 0 ? "" : d.profit >= 0 ? "text-emerald-700" : "text-red-700")}>{d.shifts ? baht(d.profit) : "–"}</span>
            <span className="text-right text-[11px] tabular-nums text-muted">{d.shifts ? `ขาย ${formatBaht(d.sales)} · ${formatNum(d.hours, 0)} ชม.` : ""}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** ป้ายคุ้ม/ไม่คุ้มสำหรับต่อท้ายตาราง */
export function WorthBadge({ profit }: { profit: number }) {
  return <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-medium", profit > 0 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800")}>{profit > 0 ? "คุ้ม" : "ไม่คุ้ม"}</span>;
}
