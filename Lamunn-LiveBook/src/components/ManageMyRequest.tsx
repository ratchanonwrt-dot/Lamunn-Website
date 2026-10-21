"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { X } from "lucide-react";
import TimeSelect from "@/components/TimeSelect";
import { toRange, minutesToLabel, DAY_END_MIN } from "@/lib/schedule";
import { timeToMinutes } from "@/lib/format";
import { EDIT_LEAD_MESSAGE } from "@/lib/bookingRules";

const HOUR_CHOICES = [1, 1.5, 2, 2.5, 3, 4, 5, 6];
const inputCls = "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-base text-ink outline-none md:text-sm transition focus:border-ink focus:ring-2 focus:ring-ink/10";

export interface ManageTarget {
  requestId: string;
  dateLabel: string;
  startTime: string;
  endTime: string;
  status: "PENDING" | "APPROVED";
}

/** โมดัลแก้เวลา / ยกเลิก ช่วงของตัวเอง */
export default function ManageMyRequest({ target, onClose }: { target: ManageTarget; onClose: () => void }) {
  const router = useRouter();
  const initialHours = (() => {
    const r = toRange(target.startTime, target.endTime);
    return r ? (r.e - r.s) / 60 : 2;
  })();
  const [startTime, setStartTime] = useState(target.startTime);
  const [hours, setHours] = useState(String(initialHours));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const s = timeToMinutes(startTime);
  const e = s === null ? null : s + Math.round(Number(hours) * 60);
  const endTime = e === null || !(Number(hours) > 0) ? "" : minutesToLabel(e);
  const dirty = startTime !== target.startTime || endTime !== target.endTime;

  async function save() {
    if (!endTime) return setError("กรุณาเลือกเวลาเริ่มและจำนวนชั่วโมง");
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/public/requests/${target.requestId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startTime, endTime }) });
    setBusy(false);
    const b = await res.json().catch(() => ({}));
    if (!res.ok) return setError(b.error ?? "แก้ไขไม่สำเร็จ");
    setDone(b.pendingChange ? `ส่งคำขอเปลี่ยนเวลาเป็น ${startTime}–${endTime} แล้ว รอทีมงานอนุมัติ — ระหว่างนี้ช่วงเดิม ${target.startTime}–${target.endTime} ยังใช้อยู่` : `แก้เวลาเป็น ${startTime}–${endTime} แล้ว`);
    router.refresh();
  }

  async function cancel() {
    if (!confirm(`ยกเลิกช่วง ${target.dateLabel} ${target.startTime}–${target.endTime} ของคุณ?${target.status === "APPROVED" ? " (ช่วงนี้อนุมัติแล้ว จะถูกถอดออกจากตาราง)" : ""}`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/public/requests/${target.requestId}`, { method: "DELETE" });
    setBusy(false);
    const b = await res.json().catch(() => ({}));
    if (!res.ok) return setError(b.error ?? "ยกเลิกไม่สำเร็จ");
    setDone("ยกเลิกช่วงนี้แล้ว");
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center sm:p-4" onClick={onClose}>
      <div onClick={(ev) => ev.stopPropagation()} className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-pop sm:rounded-2xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-stone-200 sm:hidden" />
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">{EDIT_LEAD_MESSAGE}</p>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-ink">ช่วงของฉัน · {target.dateLabel}</h2>
            <p className="text-xs text-muted">
              {target.startTime}–{target.endTime} ·{" "}
              <span className={clsx("rounded-full px-2 py-0.5 text-[11px]", target.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800")}>
                {target.status === "APPROVED" ? "อนุมัติแล้ว" : "รออนุมัติ"}
              </span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-muted">
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {done}
            <button onClick={onClose} className="ml-3 text-xs underline">
              ปิด
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">เวลาเริ่ม</label>
                <TimeSelect value={startTime} onChange={setStartTime} required minuteStep={30} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">ไลฟ์กี่ชั่วโมง</label>
                <input type="number" inputMode="decimal" min={1} max={12} step={0.5} value={hours} onChange={(ev) => setHours(ev.target.value)} className={inputCls} />
              </div>
              <div className="col-span-2 flex flex-wrap gap-1.5">
                {HOUR_CHOICES.map((h) => (
                  <button key={h} type="button" onClick={() => setHours(String(h))} className={clsx("rounded-lg border px-2.5 py-1 text-xs tabular-nums", Number(hours) === h ? "border-brand-500 bg-brand-50 font-semibold text-brand-700" : "border-line text-muted hover:bg-paper")}>
                    {h} ชม.
                  </button>
                ))}
              </div>
              <p className="col-span-2 text-xs text-muted">
                {endTime ? (
                  <>
                    ช่วงใหม่ <span className="font-semibold tabular-nums text-ink">{startTime}–{endTime}</span>
                    {e !== null && e > DAY_END_MIN && <span className="text-stone-400"> (ข้ามเที่ยงคืน)</span>}
                  </>
                ) : (
                  "เลือกเวลาเริ่มและจำนวนชั่วโมง"
                )}
              </p>
            </div>
            <p className="mt-2 text-[11px] text-stone-400">ต้องไม่ทับช่วงที่มีคนไลฟ์แล้วและเว้นอย่างน้อย 30 นาที {target.status === "APPROVED" ? "· ย่อให้แคบลงภายในช่วงเดิม = มีผลทันที · ขยายหรือเลื่อนออกนอกช่วงเดิม = ต้องรอทีมงานอนุมัติ (ช่วงเดิมยังอยู่จนกว่าจะอนุมัติ) · ยกเลิกได้ทันที" : ""}</p>
            {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={save} disabled={busy || !dirty} className="rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-40">
                {busy ? "กำลังบันทึก..." : "บันทึกเวลาใหม่"}
              </button>
              <button onClick={cancel} disabled={busy} className="rounded-xl border border-red-200 px-5 py-2.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50">
                ยกเลิกช่วงนี้
              </button>
              <button onClick={onClose} className="rounded-xl px-3 py-2.5 text-sm text-stone-400 hover:text-muted">
                ปิด
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
