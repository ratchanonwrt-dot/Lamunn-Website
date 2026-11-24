"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCanEdit } from "@/lib/RoleContext";

export default function AddHeldDepositForm() {
  const router = useRouter();
  const canEdit = useCanEdit("HELD_DEPOSITS");
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState("");
  const [amount, setAmount] = useState("");
  const [depositedAt, setDepositedAt] = useState("");
  const [status, setStatus] = useState("CONTRACT_ONGOING");
  const [vatType, setVatType] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  if (!canEdit) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/held-deposits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location, amount, depositedAt: depositedAt || undefined, status, vatType: vatType || undefined, note }),
    });
    setSaving(false);
    setLocation("");
    setAmount("");
    setDepositedAt("");
    setStatus("CONTRACT_ONGOING");
    setVatType("");
    setNote("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mb-4 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-600/20 hover:bg-brand-700">
        + เพิ่มเงินมัดจำ
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">มัดจำที่ไหน / เรื่องอะไร</label>
        <input
          required
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="เช่น มัดจำก๊าซ, มัดจำร้าน EmQuartier"
          className="w-64 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">จำนวนเงิน (บาท)</label>
        <input required type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-36 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">วันที่มัดจำ (ไม่บังคับ)</label>
        <input type="date" value={depositedAt} onChange={(e) => setDepositedAt(e.target.value)} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">สถานะ</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white">
          <option value="CONTRACT_ONGOING">ยังไม่หมดสัญญา</option>
          <option value="NOT_RETURNED">ยังไม่ได้คืน</option>
          <option value="DEDUCTED">หักเงินประกัน</option>
          <option value="RETURNED">ได้คืนแล้ว</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">VAT</label>
        <select value={vatType} onChange={(e) => setVatType(e.target.value)} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white">
          <option value="">ยังไม่ระบุ</option>
          <option value="INCLUDES_VAT">รวม VAT</option>
          <option value="EXCLUDES_VAT">ไม่รวม VAT</option>
          <option value="NO_VAT">ไม่มี VAT</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">หมายเหตุ</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} className="w-48 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white" />
      </div>
      <button type="submit" disabled={saving} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
        {saving ? "กำลังบันทึก..." : "บันทึก"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50">
        ยกเลิก
      </button>
    </form>
  );
}
