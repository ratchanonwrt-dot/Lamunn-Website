"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { computePay, type PaySettings } from "@/lib/pay";
import { toRange, minutesToLabel } from "@/lib/schedule";
import { formatBaht, formatNum } from "@/lib/format";

interface ExistingSlot {
  startTime: string;
  endTime: string;
  viewers: number | null;
  sales: number;
  peakViewers: number | null;
  orders: number | null;
}

interface Row {
  startTime: string;
  endTime: string;
  hours: number;
  viewers: string;
  sales: string;
}

const inputCls = "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm tabular-nums outline-none focus:border-brand-400 focus:bg-white";

/** แบ่งช่วงของกะเป็นรายชั่วโมง (ช่วงสุดท้ายอาจสั้นกว่า 1 ชม.) */
function hourlyRows(start: string, end: string): Row[] {
  const r = toRange(start, end);
  if (!r) return [];
  const rows: Row[] = [];
  for (let s = r.s; s < r.e; s += 60) {
    const e = Math.min(s + 60, r.e);
    rows.push({ startTime: minutesToLabel(s), endTime: minutesToLabel(e), hours: (e - s) / 60, viewers: "", sales: "" });
  }
  return rows;
}

export default function ShiftResultsForm({
  shiftId,
  startTime,
  endTime,
  settings,
  existing,
  payOverride = null,
  shiftDate,
}: {
  shiftId: string;
  startTime: string;
  endTime: string;
  settings: PaySettings;
  existing: ExistingSlot[];
  payOverride?: number | null; // ยอดที่แอดมินกำหนดเอง (ถ้ามี) — ต้องแสดงตัวเลขเดียวกับกล่องค่าตอบแทน
  shiftDate?: string; // YYYY-MM-DD — เลือกแบบเหมา/แบบคอมตามวันที่เริ่มใช้
}) {
  const router = useRouter();
  const hasExisting = existing.length > 0;

  // ถ้ามีผลเดิมที่ตรงกับช่วงรายชั่วโมง ให้เติมกลับมาแก้ได้; ยอดขายที่ถูกเฉลี่ยลงทุกช่วงเท่ากันถือว่าเป็น "ยอดรวม" ไม่ใช่รายชั่วโมง
  const [rows, setRows] = useState<Row[]>(() => {
    const base = hourlyRows(startTime, endTime);
    if (!hasExisting) return base;
    const salesSet = new Set(existing.map((s) => s.sales.toFixed(2)));
    const perHour = salesSet.size > 1;
    return base.map((row) => {
      const m = existing.find((s) => s.startTime === row.startTime);
      return m ? { ...row, viewers: m.viewers === null ? "" : String(m.viewers), sales: perHour && m.sales ? String(m.sales) : "" } : row;
    });
  });
  const [totalSales, setTotalSales] = useState<string>(() => {
    if (!hasExisting) return "";
    const salesSet = new Set(existing.map((s) => s.sales.toFixed(2)));
    const total = existing.reduce((a, s) => a + s.sales, 0);
    return salesSet.size > 1 ? "" : total ? String(Math.round(total * 100) / 100) : "";
  });
  const [peak, setPeak] = useState<string>(() => {
    const p = existing.reduce<number | null>((a, s) => (s.peakViewers === null ? a : a === null ? s.peakViewers : Math.max(a, s.peakViewers)), null);
    return p === null ? "" : String(p);
  });
  const [orders, setOrders] = useState<string>(() => {
    const o = existing.reduce((a, s) => a + (s.orders ?? 0), 0);
    return o ? String(o) : "";
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const perHourMode = rows.some((r) => r.sales.trim() !== "");
  const totalHours = rows.reduce((a, r) => a + r.hours, 0);

  const preview = useMemo(() => {
    const filled = rows.filter((r) => r.viewers.trim() !== "" && Number.isFinite(Number(r.viewers)));
    const w = filled.reduce((a, r) => a + r.hours, 0);
    const vw = filled.reduce((a, r) => a + Number(r.viewers) * r.hours, 0);
    const sales = perHourMode ? rows.reduce((a, r) => a + (Number(r.sales) || 0), 0) : Number(totalSales) || 0;
    return { avgViewers: w > 0 ? vw / w : null, filled: filled.length, sales, pay: computePay(sales, totalHours, settings, shiftDate) };
  }, [rows, totalSales, perHourMode, totalHours, settings, shiftDate]);

  function setRow(i: number, key: "viewers" | "sales", v: string) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: v } : r)));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    // ยอดรวม -> เฉลี่ยลงแต่ละชั่วโมงตามความยาวช่วง (ปัดเศษให้รวมแล้วเท่ายอดรวมพอดี)
    const total = Number(totalSales) || 0;
    let allocated = 0;
    const payloadRows = rows.map((r, i) => {
      let sales: number;
      if (perHourMode) sales = Number(r.sales) || 0;
      else if (i === rows.length - 1) sales = Math.round((total - allocated) * 100) / 100;
      else {
        sales = Math.round(((total * r.hours) / totalHours) * 100) / 100;
        allocated += sales;
      }
      const maxRow = rows.reduce((best, x) => ((Number(x.viewers) || 0) > (Number(best.viewers) || 0) ? x : best), rows[0]);
      return {
        startTime: r.startTime,
        endTime: r.endTime,
        viewers: r.viewers.trim() === "" ? null : r.viewers,
        sales,
        peakViewers: peak && r === maxRow ? peak : null,
      };
    });
    const res = await fetch(`/api/shifts/${shiftId}/results`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: payloadRows, orders: orders || null }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="rounded-2xl border border-line bg-white shadow-card p-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* รายชั่วโมง */}
        <div className="lg:col-span-3">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] font-semibold uppercase tracking-wider text-stone-400">
              <tr>
                <th className="pb-1.5 font-medium">ชั่วโมง</th>
                <th className="pb-1.5 font-medium">
                  คนดูเฉลี่ยในชั่วโมงนี้ <span className="font-normal">(ไม่บังคับ)</span>
                </th>
                <th className="pb-1.5 font-medium">
                  ยอดขาย <span className="font-normal">(ถ้าแยกรายชั่วโมงได้)</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.startTime}>
                  <td className="py-1 pr-3 tabular-nums text-ink/80">
                    {r.startTime}–{r.endTime}
                    {r.hours < 1 && <span className="ml-1 text-[10px] text-stone-400">({Math.round(r.hours * 60)} น.)</span>}
                  </td>
                  <td className="py-1 pr-3">
                    <input type="number" inputMode="numeric" min={0} value={r.viewers} onChange={(e) => setRow(i, "viewers", e.target.value)} className={inputCls} placeholder="ว่างได้" />
                  </td>
                  <td className="py-1">
                    <input type="number" inputMode="decimal" min={0} step="any" value={r.sales} onChange={(e) => setRow(i, "sales", e.target.value)} className={inputCls} placeholder="-" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">ยอดขายรวมทั้งกะ (บาท)</label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={perHourMode ? String(Math.round(preview.sales * 100) / 100) : totalSales}
                readOnly={perHourMode}
                onChange={(e) => setTotalSales(e.target.value)}
                className={clsx(inputCls, perHourMode && "bg-stone-100 text-muted")}
                placeholder="0"
              />
              {perHourMode && <p className="mt-1 text-[10px] text-stone-400">รวมจากรายชั่วโมงอัตโนมัติ</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">คนดูสูงสุดทั้งกะ</label>
              <input type="number" inputMode="numeric" min={0} value={peak} onChange={(e) => setPeak(e.target.value)} className={inputCls} placeholder="-" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">ออเดอร์รวม</label>
              <input type="number" inputMode="numeric" min={0} value={orders} onChange={(e) => setOrders(e.target.value)} className={inputCls} placeholder="-" />
            </div>
          </div>
          {!perHourMode && <p className="mt-2 text-[11px] text-stone-400">ถ้าไม่แยกยอดขายรายชั่วโมง ระบบจะเฉลี่ยยอดรวมลงทุกชั่วโมงเท่า ๆ กันเพื่อใช้ในหน้าวิเคราะห์ ส่วนค่าตอบแทนคิดจากยอดรวมเท่านั้น</p>}
        </div>

        {/* พรีวิว */}
        <div className="rounded-xl bg-paper p-4 lg:col-span-2">
          <p className="text-xs font-semibold text-muted">สรุปกะนี้ (คำนวณสดตามที่กรอก)</p>
          <dl className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">คนดูเฉลี่ยทั้งกะ</dt>
              <dd className="tabular-nums text-ink">
                {preview.avgViewers === null ? "-" : formatNum(preview.avgViewers)}
                {preview.filled > 0 && preview.filled < rows.length && <span className="ml-1 text-[10px] text-stone-400">(จาก {preview.filled}/{rows.length} ชม. ที่กรอก)</span>}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">ชั่วโมงไลฟ์</dt>
              <dd className="tabular-nums text-ink">{formatNum(totalHours, 2)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">ยอดขาย</dt>
              <dd className="tabular-nums text-ink">{formatBaht(preview.sales)} ฿</dd>
            </div>
            {preview.pay.mode === "HOURLY" ? (
              <div className="flex justify-between">
                <dt className="text-muted">เหมา {formatBaht(preview.pay.rate)} × {formatNum(totalHours, 2)} ชม.</dt>
                <dd className="tabular-nums text-ink">{formatBaht(preview.pay.minPay)} ฿</dd>
              </div>
            ) : (
            <>
            <div className="flex justify-between">
              <dt className="text-muted">หลังหักค่าส่ง {formatNum(settings.shippingPct, 2)}%</dt>
              <dd className="tabular-nums text-ink">{formatBaht(preview.pay.net)} ฿</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">คอม {formatNum(settings.commissionPct, 2)}%</dt>
              <dd className="tabular-nums text-ink">{formatBaht(preview.pay.commission)} ฿</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">ขั้นต่ำ {formatBaht(settings.minHourly)} × {formatNum(totalHours, 2)} ชม.</dt>
              <dd className="tabular-nums text-ink">{formatBaht(preview.pay.minPay)} ฿</dd>
            </div>
            </>
            )}
          </dl>
          <div className="mt-3 border-t border-line pt-3">
            <p className="text-[11px] text-stone-400">จ่ายคนไลฟ์</p>
            {payOverride !== null ? (
              <>
                <p className="text-xl font-bold tabular-nums text-brand-800">{formatBaht(payOverride)} ฿</p>
                <p className="text-xs text-muted">
                  แอดมินกำหนดยอดนี้เอง · ระบบคำนวณจากที่กรอกได้ {formatBaht(preview.pay.pay)} ฿
                </p>
              </>
            ) : (
              <>
                <p className={clsx("text-xl font-bold tabular-nums", preview.pay.hitMinimum ? "text-amber-700" : "text-ink")}>{formatBaht(preview.pay.pay)} ฿</p>
                <p className="text-xs text-muted">
                  {preview.pay.mode === "HOURLY"
                    ? `เหมาชั่วโมงละ ${formatBaht(preview.pay.rate)} ฿ ไม่มีคอมเพิ่ม · = ${preview.pay.costPct === null ? "-" : formatNum(preview.pay.costPct, 1) + "%"} ของยอดขาย`
                    : preview.pay.hitMinimum
                    ? `ไม่ถึงขั้นต่ำ จ่ายตามขั้นต่ำ = คอมจริง ${preview.pay.effectivePct === null ? "-" : formatNum(preview.pay.effectivePct, 1) + "%"}`
                    : `ตามคอมมิชชั่น ${formatNum(settings.commissionPct, 2)}%`}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {saved && <p className="mt-3 text-sm text-emerald-600">บันทึกแล้ว</p>}
      <button type="submit" disabled={saving} className="mt-4 rounded-xl bg-ink px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50">
        {saving ? "กำลังบันทึก..." : hasExisting ? "บันทึกการแก้ไข" : "บันทึกผลกะนี้"}
      </button>
    </form>
  );
}
