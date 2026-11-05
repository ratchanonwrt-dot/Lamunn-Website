"use client";

import { useState } from "react";
import { useServerRefresh } from "./useServerRefresh";
import { Plus } from "lucide-react";
import { CHANNEL_LABELS } from "@/lib/accounting/channels";

const CHANNEL_OPTIONS = Object.entries(CHANNEL_LABELS);

const today = () => new Date().toISOString().slice(0, 10);

/** บันทึกใบกำกับภาษีเต็มรูปที่ออกให้ลูกค้าที่มาขอทีหลัง
 *
 * ค่าเริ่มต้นคือ "ยอดนี้อยู่ในยอดขายรวมของวันนั้นแล้ว" ซึ่งเป็นกรณีปกติ (ลูกค้าซื้อหน้าร้าน
 * แล้วมาขอใบกำกับ) — ระบบจะไม่ลงรายได้ซ้ำ ติ๊กออกเฉพาะเมื่อเป็นการขายที่ไม่ผ่าน POS */
export default function TaxInvoiceForm({ branches }: { branches: { id: string; name: string }[] }) {
  const { refresh, refreshing } = useServerRefresh();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const busy = submitting || refreshing;
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    issueDate: today(),
    saleDate: today(),
    branchId: "",
    channel: "STOREFRONT",
    receiptNo: "",
    customerName: "",
    taxId: "",
    branchTag: "สำนักงานใหญ่",
    address: "",
    description: "อาหารและเครื่องดื่ม",
    amount: "",
    amountIncludesVat: true,
    deductFromBulk: true,
    note: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/accounting/tax-invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    setForm({ ...form, customerName: "", taxId: "", address: "", amount: "", receiptNo: "", note: "" });
    setOpen(false);
    refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        <Plus size={15} /> ออกใบกำกับภาษีเต็มรูป
      </button>
    );
  }

  const field = "mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900";
  const label = "text-xs text-gray-500";

  return (
    <form onSubmit={submit} className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="mb-4 text-sm font-semibold text-gray-800">ออกใบกำกับภาษีเต็มรูป</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className={label}>
          วันที่ออกใบกำกับ
          <input type="date" lang="en-GB" required value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} className={field} />
        </label>
        <label className={label}>
          วันที่ขายจริง (ตามบิล)
          <input type="date" lang="en-GB" required value={form.saleDate} onChange={(e) => setForm({ ...form, saleDate: e.target.value })} className={field} />
        </label>
        <label className={label}>
          สาขาที่ขาย
          <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className={field}>
            <option value="">— ไม่ระบุ —</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          ช่องทางที่ยอดนี้อยู่
          <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} className={field}>
            {CHANNEL_OPTIONS.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </label>

        <label className={label}>
          เลขที่บิล POS
          <input value={form.receiptNo} onChange={(e) => setForm({ ...form, receiptNo: e.target.value })} placeholder="เช่น 0012345" className={field} />
        </label>
        <label className={`${label} sm:col-span-2`}>
          ชื่อลูกค้า / ชื่อนิติบุคคล
          <input required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} className={field} />
        </label>
        <label className={label}>
          เลขประจำตัวผู้เสียภาษี
          <input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} maxLength={13} className={field} />
        </label>

        <label className={label}>
          สำนักงานใหญ่ / สาขาที่
          <input value={form.branchTag} onChange={(e) => setForm({ ...form, branchTag: e.target.value })} className={field} />
        </label>
        <label className={`${label} sm:col-span-3`}>
          ที่อยู่
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={field} />
        </label>

        <label className={`${label} sm:col-span-2`}>
          รายการสินค้า/บริการ
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={field} />
        </label>
        <label className={label}>
          ยอดเงิน
          <input required inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={field} />
        </label>
        <label className={label}>
          ยอดที่กรอก
          <select
            value={form.amountIncludesVat ? "inc" : "exc"}
            onChange={(e) => setForm({ ...form, amountIncludesVat: e.target.value === "inc" })}
            className={field}
          >
            <option value="inc">รวม VAT แล้ว (ราคาหน้าร้าน)</option>
            <option value="exc">ยังไม่รวม VAT</option>
          </select>
        </label>
      </div>

      <label className="mt-4 flex items-start gap-2.5 rounded-lg bg-gray-50 p-3">
        <input
          type="checkbox"
          checked={form.deductFromBulk}
          onChange={(e) => setForm({ ...form, deductFromBulk: e.target.checked })}
          className="mt-0.5 h-4 w-4 rounded border-gray-300"
        />
        <span className="text-sm text-gray-700">
          ยอดนี้อยู่ในยอดขายรวมของวันที่ขายอยู่แล้ว
          <span className="mt-0.5 block text-xs text-gray-500">
            ติ๊กไว้ = ระบบจะไม่ลงรายได้ซ้ำ (กรณีปกติ: ลูกค้าซื้อหน้าร้านแล้วมาขอใบกำกับทีหลัง) ·
            เอาติ๊กออกเฉพาะการขายที่ไม่ได้ผ่าน POS เช่น ขายส่ง หรืองานจัดเลี้ยงที่ยังไม่ได้รวมในยอดรายวัน
          </span>
        </span>
      </label>

      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {busy ? "กำลังบันทึก..." : "ออกใบกำกับ"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
          ยกเลิก
        </button>
      </div>
    </form>
  );
}
