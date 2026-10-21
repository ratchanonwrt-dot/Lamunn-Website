"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { useCanEdit } from "@/lib/RoleContext";

const inputCls = "w-28 rounded-xl border border-line bg-white px-3 py-2 text-sm tabular-nums text-ink outline-none transition focus:border-ink focus:ring-2 focus:ring-ink/10";

interface Props {
  shippingPct: number;
  commissionPct: number;
  minHourly: number;
  payMode: string;
  hourlyRate: number;
  hourlyFrom: string | null; // YYYY-MM-DD
}

export default function PaySettingsForm({ settings }: { settings: Props }) {
  const router = useRouter();
  const canEdit = useCanEdit();
  const [payMode, setPayMode] = useState(settings.payMode === "HOURLY" ? "HOURLY" : "COMMISSION");
  const [hourlyRate, setHourlyRate] = useState(String(settings.hourlyRate));
  const [hourlyFrom, setHourlyFrom] = useState(settings.hourlyFrom ?? "");
  const [shippingPct, setShippingPct] = useState(String(settings.shippingPct));
  const [commissionPct, setCommissionPct] = useState(String(settings.commissionPct));
  const [minHourly, setMinHourly] = useState(String(settings.minHourly));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/pay-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payMode, hourlyRate, hourlyFrom: hourlyFrom || null, shippingPct, commissionPct, minHourly }),
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
    <form onSubmit={save} className="rounded-2xl border border-line bg-white p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted">แบบจ่าย</span>
        {[
          { v: "HOURLY", label: "เหมารายชั่วโมง" },
          { v: "COMMISSION", label: "คอมมิชชั่น + ขั้นต่ำ (แบบเดิม)" },
        ].map((o) => (
          <button
            key={o.v}
            type="button"
            disabled={!canEdit}
            onClick={() => setPayMode(o.v)}
            className={clsx("rounded-lg border px-3 py-1.5 text-sm", payMode === o.v ? "border-ink bg-ink font-semibold text-white" : "border-line text-muted hover:bg-paper")}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {payMode === "HOURLY" ? (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">ชั่วโมงละ (บาท)</label>
              <input type="number" step="1" min={0} disabled={!canEdit} value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">เริ่มใช้ตั้งแต่กะวันที่</label>
              <input type="date" disabled={!canEdit} value={hourlyFrom} onChange={(e) => setHourlyFrom(e.target.value)} className={inputCls + " w-40"} />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">หักค่าส่งก่อน (%)</label>
              <input type="number" step="0.01" min={0} max={100} disabled={!canEdit} value={shippingPct} onChange={(e) => setShippingPct(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">คอมมิชชั่น (%)</label>
              <input type="number" step="0.01" min={0} max={100} disabled={!canEdit} value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">ขั้นต่ำต่อชั่วโมง (บาท)</label>
              <input type="number" step="1" min={0} disabled={!canEdit} value={minHourly} onChange={(e) => setMinHourly(e.target.value)} className={inputCls} />
            </div>
          </>
        )}
        {canEdit && (
          <button type="submit" disabled={saving} className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {saving ? "กำลังบันทึก..." : "บันทึกอัตรา"}
          </button>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-emerald-600">บันทึกแล้ว</p>}
      </div>
      <p className="mt-2 text-[11px] text-stone-400">
        {payMode === "HOURLY"
          ? `จ่ายเหมา ชั่วโมง × อัตรา ทุกคนเท่ากัน ไม่มีคอมมิชชั่นเพิ่ม · กะก่อนวันที่เริ่มใช้ยังคิดแบบคอมมิชชั่นเดิม (${settings.commissionPct}% หลังหักค่าส่ง ${settings.shippingPct}% / ขั้นต่ำ ${settings.minHourly} ฿) ตัวเลขย้อนหลังจึงไม่เปลี่ยน`
          : "สูตร: ยอดขาย × (1 − ค่าส่ง%) × คอม% เทียบกับ ขั้นต่ำ × ชั่วโมง จ่ายตัวที่มากกว่า"}
        {" · ยอดที่อนุมัติทำจ่ายไปแล้วไม่เปลี่ยนตาม"}
      </p>
    </form>
  );
}
