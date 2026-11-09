"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DIVIDEND_SOURCES, DIVIDEND_SOURCE_LABEL, type DividendSource } from "@/lib/dividendSource";

export default function AddDividendForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [source, setSource] = useState<DividendSource | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/dividend-payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, amount, note, source }),
    });
    setSaving(false);
    setAmount("");
    setNote("");
    setSource(null);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mb-4 rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
        + บันทึกเงินปันผลที่จ่ายไป
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">วันที่จ่าย</label>
        <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">จำนวนเงิน (บาท)</label>
        <input required type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-40 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">จ่ายจาก</label>
        <div className="inline-flex rounded-lg bg-gray-100 p-1">
          {DIVIDEND_SOURCES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource(s)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${source === s ? (s === "CASH" ? "bg-amber-500 text-white" : "bg-sky-600 text-white") : "text-gray-500 hover:text-gray-700"}`}
            >
              {DIVIDEND_SOURCE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">หมายเหตุ</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} className="w-48 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white" />
      </div>
      <button type="submit" disabled={saving || !source} title={!source ? "เลือกก่อนว่าจ่ายจากเงินสดหรือบัญชีบริษัท" : undefined} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
        {saving ? "กำลังบันทึก..." : "บันทึก"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50">
        ยกเลิก
      </button>
    </form>
  );
}
