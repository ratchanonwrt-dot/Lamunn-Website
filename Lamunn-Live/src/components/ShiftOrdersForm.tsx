"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { formatBaht, formatNum } from "@/lib/format";

interface ProductOpt {
  id: string;
  name: string;
  costPerSet: number;
}

interface Line {
  productId: string;
  quantity: string;
  unitCost: number | null; // ต้นทุนที่บันทึกไว้แล้ว (null = ใช้ต้นทุนปัจจุบันของสินค้า)
}

const inputCls = "rounded-xl border border-line bg-white px-3 py-2 text-sm tabular-nums text-ink outline-none transition focus:border-ink focus:ring-2 focus:ring-ink/10";

/** กรอกออเดอร์ของกะ: สั่งชุดไหนกี่ชุด + จำนวนออเดอร์ + ค่าส่งรวม → ต้นทุนวัตถุดิบและค่าส่งจริง */
export default function ShiftOrdersForm({
  shiftId,
  products,
  existing,
  sales,
}: {
  shiftId: string;
  products: ProductOpt[];
  existing: { orderCount: number | null; shippingCost: number | null; lines: { productId: string | null; productName: string; quantity: number; unitCost: number }[] };
  sales: number;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>(() =>
    existing.lines.length ? existing.lines.filter((l) => l.productId).map((l) => ({ productId: l.productId!, quantity: String(l.quantity), unitCost: l.unitCost })) : [{ productId: "", quantity: "", unitCost: null }],
  );
  const [orderCount, setOrderCount] = useState(existing.orderCount === null ? "" : String(existing.orderCount));
  const [shippingCost, setShippingCost] = useState(existing.shippingCost === null ? "" : String(existing.shippingCost));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const hasExisting = existing.lines.length > 0 || existing.orderCount !== null || existing.shippingCost !== null;
  // สินค้าที่ถูกลบจากรายการไปแล้วแต่ยังอยู่ในออเดอร์เก่า — แสดงไว้ให้รู้ แต่แก้ไม่ได้
  const orphaned = existing.lines.filter((l) => !l.productId);

  const preview = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    let sets = 0;
    let cogs = 0;
    for (const l of lines) {
      const q = Number(l.quantity);
      if (!l.productId || !(q > 0)) continue;
      sets += q;
      cogs += q * (l.unitCost ?? byId.get(l.productId)?.costPerSet ?? 0);
    }
    for (const o of orphaned) {
      sets += o.quantity;
      cogs += o.quantity * o.unitCost;
    }
    const ship = Number(shippingCost) || 0;
    const oc = Number(orderCount) || 0;
    return { sets, cogs, ship, perOrder: oc > 0 ? ship / oc : null };
  }, [lines, products, shippingCost, orderCount, orphaned]);

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch(`/api/shifts/${shiftId}/orders`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderCount, shippingCost, lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })) }),
    });
    setSaving(false);
    const b = await res.json().catch(() => ({}));
    if (!res.ok) return setError(b.error ?? "บันทึกไม่สำเร็จ");
    setSaved(true);
    router.refresh();
  }

  const used = new Set(lines.map((l) => l.productId).filter(Boolean));
  const activeProducts = products;

  return (
    <form onSubmit={save} className="rounded-2xl border border-line bg-white p-4 shadow-card">
      {products.length === 0 ? (
        <p className="text-sm text-muted">
          ยังไม่มีรายการสินค้า —{" "}
          <Link href="/products" className="font-medium text-brand-600 hover:underline">
            เพิ่มสินค้าและต้นทุนต่อชุด
          </Link>{" "}
          ก่อน แล้วกลับมากรอกออเดอร์
        </p>
      ) : (
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select value={l.productId} onChange={(e) => setLine(i, { productId: e.target.value, unitCost: null })} className={inputCls + " w-64"}>
                <option value="">— เลือกสินค้า/ชุด —</option>
                {activeProducts.map((p) => (
                  <option key={p.id} value={p.id} disabled={used.has(p.id) && p.id !== l.productId}>
                    {p.name} (ต้นทุน {formatBaht(p.costPerSet)} ฿/ชุด)
                  </option>
                ))}
              </select>
              <input type="number" min={0} step={1} inputMode="numeric" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} className={inputCls + " w-24 text-right"} placeholder="ชุด" />
              <span className="text-xs text-muted">ชุด</span>
              {l.unitCost !== null && l.productId && products.find((p) => p.id === l.productId)?.costPerSet !== l.unitCost && (
                <span className="text-[11px] text-stone-400">ใช้ต้นทุนตอนกรอก {formatBaht(l.unitCost)} ฿/ชุด</span>
              )}
              {lines.length > 1 && (
                <button type="button" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} className="rounded p-1 text-stone-400 hover:text-red-600" aria-label="ลบแถว">
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          {orphaned.map((o, i) => (
            <p key={`o${i}`} className="text-xs text-stone-400">
              {o.productName} × {o.quantity} ชุด (สินค้าถูกลบจากรายการแล้ว คงไว้ตามที่กรอก)
            </p>
          ))}
          <button type="button" onClick={() => setLines((ls) => [...ls, { productId: "", quantity: "", unitCost: null }])} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
            <Plus size={13} /> เพิ่มสินค้าอีกแถว
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-line/60 pt-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">จำนวนออเดอร์ (พัสดุ)</label>
          <input type="number" min={0} step={1} inputMode="numeric" value={orderCount} onChange={(e) => setOrderCount(e.target.value)} className={inputCls + " w-32 text-right"} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">ค่าส่งรวมทั้งกะ (บาท)</label>
          <input type="number" min={0} step="0.01" inputMode="decimal" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} className={inputCls + " w-40 text-right"} />
        </div>
        <dl className="ml-auto grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm">
          <dt className="text-muted">รวม</dt>
          <dd className="text-right tabular-nums text-ink">{formatNum(preview.sets)} ชุด</dd>
          <dt className="text-muted">ต้นทุนวัตถุดิบ</dt>
          <dd className="text-right tabular-nums font-semibold text-ink">{formatBaht(preview.cogs)} ฿</dd>
          <dt className="text-muted">ค่าส่ง{preview.perOrder !== null && <span className="text-[11px]"> ({formatBaht(preview.perOrder)} ฿/ออเดอร์)</span>}</dt>
          <dd className="text-right tabular-nums font-semibold text-ink">{formatBaht(preview.ship)} ฿</dd>
          {sales > 0 && (
            <>
              <dt className="text-muted">คิดเป็น % ของยอดขาย</dt>
              <dd className="text-right tabular-nums text-muted">
                วัตถุดิบ {formatNum((preview.cogs / sales) * 100, 1)}% · ส่ง {formatNum((preview.ship / sales) * 100, 1)}%
              </dd>
            </>
          )}
        </dl>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {saved && <p className="mt-3 text-sm text-emerald-600">บันทึกออเดอร์แล้ว</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className="rounded-xl bg-ink px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50">
          {saving ? "กำลังบันทึก..." : hasExisting ? "บันทึกการแก้ไขออเดอร์" : "บันทึกออเดอร์"}
        </button>
        <span className="text-[11px] text-stone-400">ยังไม่กรอก = หน้าสรุปกำไรใช้ % ประมาณแทน</span>
      </div>
    </form>
  );
}
