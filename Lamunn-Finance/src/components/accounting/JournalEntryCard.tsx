"use client";

import { useEffect, useState } from "react";
import EntryActions, { type EntryStatus } from "./EntryActions";

const STATUS_STYLE: Record<EntryStatus, string> = {
  DRAFT: "bg-amber-100 text-amber-700",
  POSTED: "bg-emerald-100 text-emerald-700",
  VOID: "bg-gray-100 text-gray-400",
};

const STATUS_LABEL: Record<EntryStatus, string> = {
  DRAFT: "ร่าง",
  POSTED: "ผ่านรายการแล้ว",
  VOID: "ยกเลิก",
};

export interface JournalEntrySummary {
  id: string;
  entryNo: string;
  status: EntryStatus;
  typeLabel: string;
  dateLabel: string;
  description: string;
  totalLabel: string;
}

/** การ์ดใบสำคัญหนึ่งใบในหน้าสมุดรายวัน — หัวการ์ด (สถานะ/ปุ่ม) เป็นฝั่งเบราว์เซอร์
 * ส่วนตารางบรรทัดยังให้เซิร์ฟเวอร์ render มาเป็น children ตามเดิม
 *
 * ถือสถานะไว้เองเพื่อให้ป้าย "ร่าง → ผ่านรายการแล้ว" และชุดปุ่มสลับทันทีที่ API ตอบ
 * ไม่ต้องรอหน้าโหลดซ้ำ พอเซิร์ฟเวอร์ส่งข้อมูลใหม่มา (prop เปลี่ยน) ค่อย sync ทับอีกที */
export default function JournalEntryCard({
  entry,
  canEdit,
  children,
}: {
  entry: JournalEntrySummary;
  canEdit: boolean;
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<EntryStatus>(entry.status);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    setStatus(entry.status);
  }, [entry.status]);

  if (removed) return null;

  return (
    <div className={`overflow-hidden rounded-xl border border-gray-200 bg-white ${status === "VOID" ? "opacity-50" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-gray-900">{entry.entryNo}</span>
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
            <span className="text-xs font-semibold text-gray-500">{entry.typeLabel}</span>
            <span className="text-xs text-gray-400">{entry.dateLabel}</span>
          </div>
          <p className="mt-0.5 text-sm font-semibold text-gray-700">{entry.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm font-semibold tabular-nums text-gray-800">{entry.totalLabel}</span>
          {canEdit && (
            <EntryActions
              entryId={entry.id}
              status={status}
              onChanged={(next) => (next === "DELETED" ? setRemoved(true) : setStatus(next))}
            />
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
