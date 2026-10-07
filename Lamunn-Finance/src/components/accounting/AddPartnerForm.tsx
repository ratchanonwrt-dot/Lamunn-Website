"use client";

import { useState } from "react";
import { useServerRefresh } from "./useServerRefresh";
import { Plus } from "lucide-react";

export default function AddPartnerForm() {
  const { refresh, refreshing } = useServerRefresh();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const busy = submitting || refreshing;
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", type: "CREDITOR", phone: "", taxId: "", branchTag: "", address: "", note: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/accounting/partners", {
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
    setForm({ name: "", type: "CREDITOR", phone: "", taxId: "", branchTag: "", address: "", note: "" });
    setOpen(false);
    refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
      >
        <Plus size={15} /> เพิ่มคู่ค้า
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-gray-800">เพิ่มคู่ค้าใหม่</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-gray-500">
          ชื่อ
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="เช่น บริษัท เอบีซี จำกัด"
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
          />
        </label>
        <label className="text-xs text-gray-500">
          ประเภท
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
          >
            <option value="CREDITOR">เจ้าหนี้ / ซัพพลายเออร์ (เราจ่ายให้)</option>
            <option value="DEBTOR">ลูกหนี้ (ค้างรับจากเรา)</option>
          </select>
        </label>
        <label className="text-xs text-gray-500">
          เบอร์โทร
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
          />
        </label>
        <label className="text-xs text-gray-500">
          เลขผู้เสียภาษี
          <input
            value={form.taxId}
            onChange={(e) => setForm({ ...form, taxId: e.target.value })}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
          />
        </label>
        <label className="text-xs text-gray-500">
          สาขา / สำนักงานใหญ่
          <input
            value={form.branchTag}
            onChange={(e) => setForm({ ...form, branchTag: e.target.value })}
            placeholder="เช่น สำนักงานใหญ่ หรือ 00001"
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
          />
        </label>
        <label className="text-xs text-gray-500 sm:col-span-2">
          ที่อยู่
          <input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
          />
        </label>
        <label className="text-xs text-gray-500 sm:col-span-2 lg:col-span-3">
          หมายเหตุ
          <input
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
          />
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? "กำลังบันทึก..." : "บันทึก"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          ยกเลิก
        </button>
      </div>
    </form>
  );
}
