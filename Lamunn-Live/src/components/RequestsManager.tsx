"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { useCanEdit } from "@/lib/RoleContext";
import { formatThaiDateShort, thaiDays } from "@/lib/format";
import { toRange, rangesOverlap } from "@/lib/schedule";

type Status = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

interface RequestRow {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  channelId: string | null;
  channelName: string | null;
  requesterName: string;
  requesterPhone: string;
  requesterLine: string | null;
  note: string | null;
  isReturning: boolean;
  status: Status;
  streamerName: string | null;
  shiftId: string | null;
  replacesShiftId: string | null; // คำขอเปลี่ยนเวลาของกะที่อนุมัติแล้ว
  reviewNote: string | null;
  reviewedBy: string | null;
  createdAt: string;
}

interface StreamerOpt {
  id: string;
  name: string;
  phone: string | null;
  lineId: string | null;
}

const digits = (s: string | null | undefined) => (s ?? "").replace(/[^\d]/g, "");
const inputCls = "rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none transition focus:border-ink focus:ring-2 focus:ring-ink/10";

/** คำขอที่รออนุมัติอื่น ๆ ที่ทับเวลากัน (วันเดียวกัน ช่องเดียวกัน) — แอดมินต้องเลือกคนใดคนหนึ่ง */
function competitorsOf(r: RequestRow, all: RequestRow[]): RequestRow[] {
  if (r.status !== "PENDING") return [];
  const mine = toRange(r.startTime, r.endTime);
  if (!mine) return [];
  return all.filter((o) => {
    if (o.id === r.id || o.status !== "PENDING" || o.date !== r.date || o.channelId !== r.channelId) return false;
    const x = toRange(o.startTime, o.endTime);
    return !!x && rangesOverlap(x, mine);
  });
}

function RequestCard({ r, streamers, competitors, onChanged }: { r: RequestRow; streamers: StreamerOpt[]; competitors: RequestRow[]; onChanged: () => void }) {
  const canEdit = useCanEdit();
  // จับคู่คนไลฟ์จากเบอร์โทร (เทียบเฉพาะตัวเลข) หรือ LINE ID
  const matched = streamers.find((s) => (digits(s.phone) && digits(s.phone) === digits(r.requesterPhone)) || (s.lineId && r.requesterLine && s.lineId.toLowerCase() === r.requesterLine.toLowerCase()));
  const [mode, setMode] = useState<"pick" | "create">(matched ? "pick" : "create");
  const [streamerId, setStreamerId] = useState(matched?.id ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = new Date(r.date + "T00:00:00Z");

  async function act(action: "approve" | "reject") {
    if (action === "reject" && !confirm(`ปฏิเสธคำขอของ ${r.requesterName}?`)) return;
    if (action === "approve" && competitors.length > 0 && !confirm(`เลือก ${r.requesterName} (${r.startTime}–${r.endTime}) เป็นผู้ไลฟ์?\n\nคำขอที่ทับกันอีก ${competitors.length} รายการจะถูกปฏิเสธอัตโนมัติ:\n${competitors.map((c) => `• ${c.requesterName} ${c.startTime}–${c.endTime}`).join("\n")}`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/requests/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action === "approve" ? (r.replacesShiftId ? { action, note } : { action, streamerId: mode === "pick" ? streamerId : null, createStreamer: mode === "create", note }) : { action, note }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "ทำรายการไม่สำเร็จ");
      return;
    }
    onChanged();
  }

  return (
    <li className={clsx("rounded-xl border bg-white p-4", r.status === "PENDING" ? (competitors.length > 0 ? "border-orange-300 ring-1 ring-orange-200" : "border-amber-200") : "border-line")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">
            {formatThaiDateShort(d)} ({thaiDays[d.getUTCDay()]}) <span className="tabular-nums">{r.startTime}–{r.endTime}</span>
            {r.channelName && <span className="ml-2 font-normal text-muted">· {r.channelName}</span>}
            {r.replacesShiftId && (
              <Link href={`/shifts/${r.replacesShiftId}`} className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 hover:underline">
                ขอเปลี่ยนเวลากะที่อนุมัติแล้ว · เปิดกะเดิม →
              </Link>
            )}
          </p>
          <p className="mt-1 text-sm text-ink/80">
            {r.requesterName}
            <span className={clsx("ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium", r.isReturning ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700")}>
              {r.isReturning ? "คนเก่า เคยไลฟ์กับเรา" : "คนใหม่"}
            </span>{" "}
            <span className="tabular-nums text-muted">📞 {r.requesterPhone}</span>
            {r.requesterLine && <span className="text-muted"> · LINE: {r.requesterLine}</span>}
          </p>
          {r.note && <p className="mt-1 text-xs text-muted">📝 {r.note}</p>}
          {competitors.length > 0 && (
            <p className="mt-1.5 rounded-lg bg-orange-50 px-2 py-1 text-xs text-orange-800">
              ขอช่วงเวลาทับกับอีก {competitors.length} คน: {competitors.map((c) => `${c.requesterName} ${c.startTime}–${c.endTime}`).join(" · ")} — เลือกอนุมัติได้คนเดียว ที่เหลือจะถูกปฏิเสธอัตโนมัติ
            </p>
          )}
          <p className="mt-1 text-[11px] text-stone-400">ส่งเมื่อ {new Date(r.createdAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" })}</p>
        </div>
        <div className="text-right">
          {r.status === "APPROVED" && (
            <div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">อนุมัติแล้ว → {r.streamerName}</span>
              {r.shiftId && (
                <Link href={`/shifts/${r.shiftId}`} className="mt-1 block text-xs font-medium text-brand-600 hover:underline">
                  เปิดกะ →
                </Link>
              )}
            </div>
          )}
          {r.status === "REJECTED" && <span className="rounded-full bg-stone-200 px-2.5 py-1 text-xs font-medium text-muted">ปฏิเสธแล้ว</span>}
          {r.status === "CANCELLED" && <span className="rounded-full bg-stone-200 px-2.5 py-1 text-xs font-medium text-muted">คนไลฟ์ยกเลิกเอง</span>}
          {r.status !== "PENDING" && r.reviewedBy && <p className="mt-1 text-[11px] text-stone-400">โดย {r.reviewedBy}</p>}
          {r.status !== "PENDING" && r.reviewNote && <p className="mt-1 text-xs text-muted">{r.reviewNote}</p>}
        </div>
      </div>

      {r.status === "PENDING" && canEdit && (
        <div className="mt-3 border-t border-line/60 pt-3">
          {r.replacesShiftId && <p className="mb-2 text-xs text-violet-700">อนุมัติ = แก้เวลากะเดิมเป็น {r.startTime}–{r.endTime} (คนไลฟ์คนเดิม) · ปฏิเสธ = กะเดิมคงเวลาเดิมไว้</p>}
          <div className="flex flex-wrap items-end gap-3">
            <div className={clsx(r.replacesShiftId && "hidden")}>
              <label className="mb-1 block text-xs font-medium text-muted">
                ผูกกับคนไลฟ์{matched && <span className="ml-1 text-emerald-600">(เจอจากเบอร์/LINE: {matched.name})</span>}
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={mode === "create" ? "__create" : streamerId}
                  onChange={(e) => {
                    if (e.target.value === "__create") setMode("create");
                    else {
                      setMode("pick");
                      setStreamerId(e.target.value);
                    }
                  }}
                  className={inputCls + " w-64"}
                >
                  <option value="__create">+ สร้างคนไลฟ์ใหม่จากคำขอนี้ ({r.requesterName})</option>
                  {streamers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.phone ? ` · ${s.phone}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs font-medium text-muted">หมายเหตุ / เหตุผล (ถ้ามี)</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls + " w-full"} placeholder="เช่น ยืนยันทาง LINE แล้ว / ช่วงนี้มีคนแล้ว" />
            </div>
            <button onClick={() => act("approve")} disabled={busy || (mode === "pick" && !streamerId)} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {busy ? "กำลังทำ..." : "อนุมัติ → ลงตาราง"}
            </button>
            <button onClick={() => act("reject")} disabled={busy} className="rounded-xl border border-line px-4 py-2 text-sm text-muted hover:border-red-200 hover:text-red-600 disabled:opacity-50">
              ปฏิเสธ
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      )}
      {r.status === "PENDING" && !canEdit && <p className="mt-2 text-xs text-stone-400">รอผู้จัดการอนุมัติ</p>}
    </li>
  );
}

export default function RequestsManager({
  status,
  counts,
  streamers,
  requests,
}: {
  status: Status | "ALL";
  counts: Record<Status, number>;
  streamers: StreamerOpt[];
  requests: RequestRow[];
}) {
  const router = useRouter();
  const tabs: { key: Status | "ALL"; label: string }[] = [
    { key: "PENDING", label: `รออนุมัติ (${counts.PENDING})` },
    { key: "APPROVED", label: `อนุมัติแล้ว (${counts.APPROVED})` },
    { key: "REJECTED", label: `ปฏิเสธ (${counts.REJECTED})` },
    { key: "CANCELLED", label: `ยกเลิกเอง (${counts.CANCELLED})` },
    { key: "ALL", label: "ทั้งหมด" },
  ];
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1 rounded-2xl border border-line bg-white shadow-card p-1">
        {tabs.map((t) => (
          <Link key={t.key} href={`/requests?status=${t.key}`} className={clsx("rounded-lg px-3 py-1.5 text-sm", status === t.key ? "bg-brand-600 font-medium text-white" : "text-muted hover:bg-paper")}>
            {t.label}
          </Link>
        ))}
      </div>
      {requests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white p-10 text-center text-stone-400">ไม่มีคำขอในหมวดนี้</div>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => (
            <RequestCard key={r.id} r={r} streamers={streamers} competitors={competitorsOf(r, requests)} onChanged={() => router.refresh()} />
          ))}
        </ul>
      )}
    </div>
  );
}
