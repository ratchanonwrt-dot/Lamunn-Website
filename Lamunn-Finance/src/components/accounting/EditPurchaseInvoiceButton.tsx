"use client";

import { useState } from "react";
import { useServerRefresh } from "./useServerRefresh";
import { signedInputToSatang } from "@/lib/accounting/money";

interface InvoiceData {
  invoiceNo: string;
  invoiceDate: string;
  vendorName: string;
  vendorTaxId: string | null;
  vendorBranchTag: string | null;
  description: string;
  note: string | null;
  isClaimable: boolean;
  totalAmount: number;
}

interface LinkedEntry {
  id: string;
  entryNo: string;
  status: "DRAFT" | "POSTED" | "VOID";
}

/** ปุ่ม "แก้ไข" ของใบกำกับภาษีซื้อในรายงานภาษีซื้อ — เปิดหน้าต่างแก้ไขทับหน้าเดิม
 *
 * ใช้บ่อยสุดกับกรณีคีย์เลขที่ใบกำกับตกหล่น 1-2 ตัว จึงเปิดมาแล้วโฟกัสช่องเลขที่เลย
 * ยอดเงิน/วันที่จะแก้ได้เฉพาะเมื่อใบสำคัญที่ผูกไว้ยังเป็นร่าง (เซิร์ฟเวอร์เป็นคนตัดสิน หน้าจอแค่บอกล่วงหน้า) */
export default function EditPurchaseInvoiceButton({ id }: { id: string }) {
  const { refresh, refreshing } = useServerRefresh();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entry, setEntry] = useState<LinkedEntry | null>(null);
  const [form, setForm] = useState<InvoiceData | null>(null);
  const [amount, setAmount] = useState("");
  const [amountDirty, setAmountDirty] = useState(false);
  const [amountIncludesVat, setAmountIncludesVat] = useState(true);

  async function openDialog() {
    setOpen(true);
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/accounting/purchase-tax-invoices/${id}`);
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "โหลดข้อมูลไม่สำเร็จ");
      return;
    }
    setForm(data.invoice);
    setEntry(data.entry);
    setAmount(String(data.invoice.totalAmount));
    setAmountDirty(false);
    setAmountIncludesVat(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/accounting/purchase-tax-invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceNo: form.invoiceNo,
        invoiceDate: form.invoiceDate,
        vendorName: form.vendorName,
        vendorTaxId: form.vendorTaxId ?? "",
        vendorBranchTag: form.vendorBranchTag ?? "",
        description: form.description,
        note: form.note ?? "",
        isClaimable: form.isClaimable,
        // ส่งยอดไปเฉพาะตอนแก้จริง — ไม่งั้นการแยกฐาน/VAT ใหม่อาจคลาดสตางค์จากของเดิม
        ...(amountDirty ? { amount, amountIncludesVat } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    setOpen(false);
    refresh();
  }

  const amountLocked = entry?.status === "POSTED";
  const isCreditNote = signedInputToSatang(amount) < 0;
  const field = "mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-400";
  const label = "text-xs text-gray-500";

  return (
    <>
      <button
        type="button"
        disabled={refreshing}
        onClick={openDialog}
        className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        {refreshing ? "กำลังอัปเดต..." : "แก้ไข"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-4 sm:items-center print:hidden">
          <form onSubmit={save} className="w-full max-w-3xl rounded-xl bg-white p-5 text-left shadow-xl">
            <p className="mb-1 text-sm font-semibold text-gray-800">แก้ไขใบกำกับภาษีซื้อ</p>
            <p className="mb-4 text-xs text-gray-500">แก้ตามที่ปรากฏบนใบกำกับจริง — รายงานภาษีซื้อและ ภ.พ.30 จะเปลี่ยนตามทันที</p>

            {loading || !form ? (
              <p className="py-6 text-center text-sm text-gray-400">{error ?? "กำลังโหลด..."}</p>
            ) : (
              <>
                {entry && entry.status !== "VOID" && (
                  <p className={`mb-3 rounded-lg px-3 py-2 text-xs ${amountLocked ? "bg-amber-50 text-amber-800" : "bg-brand-50 text-brand-800"}`}>
                    ใบนี้ผูกกับใบสำคัญ <span className="font-mono">{entry.entryNo}</span>
                    {amountLocked
                      ? " ซึ่งผ่านรายการแล้ว — แก้ได้เฉพาะเลขที่/ชื่อ/รายการ ถ้าจะแก้ยอดเงินหรือวันที่ ให้กด \"ยกเลิกผ่านรายการ\" ในสมุดรายวันก่อน"
                      : " (ยังเป็นร่าง) — แก้ยอดเงินหรือวันที่แล้ว ระบบจะปรับบรรทัดในใบสำคัญให้ตรงกัน"}
                  </p>
                )}

                {isCreditNote && (
                  <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                    ยอดนี้เป็นใบลดหนี้ ระบบจะเก็บฐานและ VAT เป็นค่าลบ พร้อมกลับด้านใบสำคัญที่ยังเป็นร่าง
                  </p>
                )}

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className={label}>
                    เลขที่ใบกำกับ (ตามใบของผู้ขาย)
                    <input
                      autoFocus
                      required
                      value={form.invoiceNo}
                      onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })}
                      className={`${field} font-mono`}
                    />
                  </label>
                  <label className={label}>
                    วันที่บนใบกำกับ
                    <input
                      type="date"
                      required
                      disabled={amountLocked}
                      value={form.invoiceDate}
                      onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })}
                      className={field}
                    />
                  </label>
                  <label className={`${label} sm:col-span-2`}>
                    ชื่อผู้ขาย (ตามใบกำกับ)
                    <input required value={form.vendorName} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} className={field} />
                  </label>
                  <label className={label}>
                    เลขประจำตัวผู้เสียภาษีผู้ขาย
                    <input
                      value={form.vendorTaxId ?? ""}
                      onChange={(e) => setForm({ ...form, vendorTaxId: e.target.value })}
                      maxLength={13}
                      className={`${field} font-mono`}
                    />
                  </label>
                  <label className={label}>
                    สำนักงานใหญ่ / สาขาที่
                    <input value={form.vendorBranchTag ?? ""} onChange={(e) => setForm({ ...form, vendorBranchTag: e.target.value })} className={field} />
                  </label>
                  <label className={`${label} sm:col-span-2`}>
                    รายการ
                    <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={field} />
                  </label>
                  <label className={label}>
                    ยอดเงิน
                    <input
                      inputMode="decimal"
                      disabled={amountLocked}
                      value={amount}
                      onChange={(e) => {
                        setAmount(e.target.value);
                        setAmountDirty(true);
                      }}
                      placeholder="เช่น 1070 หรือ (1070)"
                      className={field}
                    />
                  </label>
                  <label className={label}>
                    ยอดที่กรอก
                    <select
                      disabled={amountLocked}
                      value={amountIncludesVat ? "inc" : "exc"}
                      onChange={(e) => {
                        setAmountIncludesVat(e.target.value === "inc");
                        setAmountDirty(true);
                      }}
                      className={field}
                    >
                      <option value="inc">รวม VAT แล้ว</option>
                      <option value="exc">ยังไม่รวม VAT</option>
                    </select>
                  </label>
                  <label className={`${label} sm:col-span-2`}>
                    หมายเหตุ
                    <input value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} className={field} />
                  </label>
                </div>

                <label className="mt-4 flex items-start gap-2.5 rounded-lg bg-gray-50 p-3">
                  <input
                    type="checkbox"
                    checked={form.isClaimable}
                    onChange={(e) => setForm({ ...form, isClaimable: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">
                    ภาษีซื้อใบนี้ขอเครดิตได้
                    <span className="mt-0.5 block text-xs text-gray-500">เอาติ๊กออกถ้าเป็นภาษีซื้อต้องห้าม — ยังอยู่ในรายงาน แต่ไม่ถูกหักใน ภ.พ.30</span>
                  </span>
                </label>

                {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
              </>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                disabled={submitting || loading || !form}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {submitting ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                ปิด
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
