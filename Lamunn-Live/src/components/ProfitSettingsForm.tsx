"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCanEdit } from "@/lib/RoleContext";

const inputCls = "w-20 rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm tabular-nums text-ink outline-none transition focus:border-ink focus:ring-2 focus:ring-ink/10";

/** % ที่หักจากยอดขายก่อนเป็นเงินได้จริง — แก้ได้เมื่อค่า Ads / ค่าธรรมเนียมเปลี่ยน */
export default function ProfitSettingsForm({ adsPct, platformFeePct }: { adsPct: number; platformFeePct: number }) {
  const router = useRouter();
  const canEdit = useCanEdit();
  const [ads, setAds] = useState(String(adsPct));
  const [fee, setFee] = useState(String(platformFeePct));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/pay-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adsPct: ads, platformFeePct: fee }) });
    setBusy(false);
    const b = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg({ ok: false, text: b.error ?? "บันทึกไม่สำเร็จ" });
    setMsg({ ok: true, text: "บันทึกแล้ว" });
    router.refresh();
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2 text-xs text-muted">
      <span>หักจากยอดขาย:</span>
      <label className="inline-flex items-center gap-1">
        ค่า Ads <input type="number" step="0.1" min={0} max={100} disabled={!canEdit} value={ads} onChange={(e) => setAds(e.target.value)} className={inputCls} />%
      </label>
      <label className="inline-flex items-center gap-1">
        ค่าธรรมเนียม TikTok <input type="number" step="0.1" min={0} max={100} disabled={!canEdit} value={fee} onChange={(e) => setFee(e.target.value)} className={inputCls} />%
      </label>
      {canEdit && (
        <button type="submit" disabled={busy || (ads === String(adsPct) && fee === String(platformFeePct))} className="rounded-lg bg-ink px-3 py-1.5 font-semibold text-white hover:bg-brand-600 disabled:opacity-40">
          {busy ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      )}
      {msg && <span className={msg.ok ? "text-emerald-600" : "text-red-600"}>{msg.text}</span>}
    </form>
  );
}
