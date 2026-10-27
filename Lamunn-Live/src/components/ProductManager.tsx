"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { formatBaht } from "@/lib/format";

interface ProductRow {
  id: string;
  name: string;
  costPerSet: number;
  isActive: boolean;
  usedInOrders: number;
}

const inputCls = "rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-ink focus:ring-2 focus:ring-ink/10";

function Row({ p, onChanged }: { p: ProductRow; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.name);
  const [cost, setCost] = useState(String(p.costPerSet));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/products/${p.id}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    setBusy(false);
    const b = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(b.error ?? "บันทึกไม่สำเร็จ");
      return false;
    }
    onChanged();
    return true;
  }

  return (
    <tr className={clsx("border-t border-line/60", !p.isActive && "text-stone-400")}>
      <td className="px-4 py-2">
        {editing ? <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls + " w-56"} /> : <span className="font-medium text-ink">{p.name}</span>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {editing ? <input type="number" step="0.01" min={0} value={cost} onChange={(e) => setCost(e.target.value)} className={inputCls + " w-28 text-right"} /> : `${formatBaht(p.costPerSet)} ฿`}
      </td>
      <td className="px-3 py-2 text-right text-muted tabular-nums">{p.usedInOrders}</td>
      <td className="px-3 py-2">
        <button disabled={busy} onClick={() => call("PATCH", { isActive: !p.isActive })} className={clsx("rounded-full px-2.5 py-1 text-xs font-medium disabled:opacity-50", p.isActive ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-muted")}>
          {p.isActive ? "ใช้งานอยู่" : "ปิดใช้งาน"}
        </button>
      </td>
      <td className="px-3 py-2 text-right text-xs">
        {editing ? (
          <span className="inline-flex gap-2">
            <button disabled={busy || !name.trim()} onClick={async () => (await call("PATCH", { name, costPerSet: cost })) && setEditing(false)} className="rounded-lg bg-ink px-3 py-1 font-semibold text-white disabled:opacity-50">
              บันทึก
            </button>
            <button onClick={() => setEditing(false)} className="rounded-lg border border-line px-3 py-1 text-muted">
              ยกเลิก
            </button>
          </span>
        ) : (
          <span className="inline-flex gap-3">
            <button onClick={() => setEditing(true)} className="font-medium text-brand-600 hover:underline">
              แก้ไข
            </button>
            {p.usedInOrders === 0 && (
              <button disabled={busy} onClick={() => confirm(`ลบ "${p.name}" ?`) && call("DELETE")} className="text-stone-400 hover:text-red-600">
                ลบ
              </button>
            )}
          </span>
        )}
      </td>
    </tr>
  );
}

export default function ProductManager({ products }: { products: ProductRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, costPerSet: cost }) });
    setSaving(false);
    const b = await res.json().catch(() => ({}));
    if (!res.ok) return setError(b.error ?? "เพิ่มไม่สำเร็จ");
    setName("");
    setCost("");
    router.refresh();
  }

  return (
    <div>
      <form onSubmit={add} className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-white p-4 shadow-card">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">ชื่อสินค้า/ชุด</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls + " w-64"} placeholder="เช่น ชุดขนมไทย 6 ชิ้น" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">ต้นทุนวัตถุดิบต่อชุด (บาท)</label>
          <input required type="number" step="0.01" min={0} value={cost} onChange={(e) => setCost(e.target.value)} className={inputCls + " w-40"} />
        </div>
        <button type="submit" disabled={saving} className="rounded-xl bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
          {saving ? "กำลังเพิ่ม..." : "+ เพิ่มสินค้า"}
        </button>
        {error && <p className="w-full text-sm text-red-600">{error}</p>}
      </form>

      <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-paper/70 text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-2">สินค้า/ชุด</th>
              <th className="px-3 py-2 text-right">ต้นทุนต่อชุด</th>
              <th className="px-3 py-2 text-right">อยู่ในออเดอร์</th>
              <th className="px-3 py-2">สถานะ</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <Row key={p.id} p={p} onChanged={() => router.refresh()} />
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-stone-400">
                  ยังไม่มีสินค้า — เพิ่มชุดที่ขายในไลฟ์พร้อมต้นทุนต่อชุด แล้วไปกรอกออเดอร์ในหน้ากะ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
