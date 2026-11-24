"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCanEdit } from "@/lib/RoleContext";

type Status = "CONTRACT_ONGOING" | "NOT_RETURNED" | "DEDUCTED" | "RETURNED";

const STATUS_META: Record<Status, { label: string; badge: string; select: string }> = {
  CONTRACT_ONGOING: { label: "ยังไม่หมดสัญญา", badge: "bg-blue-100 text-blue-700", select: "text-blue-700" },
  NOT_RETURNED: { label: "ยังไม่ได้คืน", badge: "bg-amber-100 text-amber-700", select: "text-amber-700" },
  DEDUCTED: { label: "หักเงินประกัน", badge: "bg-red-100 text-red-700", select: "text-red-700" },
  RETURNED: { label: "ได้คืนแล้ว", badge: "bg-emerald-100 text-emerald-700", select: "text-emerald-700" },
};

export default function HeldDepositStatusBadge({ id, status }: { id: string; status: Status }) {
  const router = useRouter();
  const canEdit = useCanEdit("HELD_DEPOSITS");
  const [loading, setLoading] = useState(false);
  const meta = STATUS_META[status];

  async function handleChange(next: Status) {
    if (loading) return;
    setLoading(true);
    await fetch(`/api/held-deposits/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setLoading(false);
    router.refresh();
  }

  if (!canEdit) {
    return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${meta.badge}`}>{meta.label}</span>;
  }

  return (
    <select
      value={status}
      disabled={loading}
      onChange={(e) => handleChange(e.target.value as Status)}
      className={`rounded-full border-0 px-2.5 py-1 text-xs font-medium outline-none disabled:opacity-50 ${meta.badge}`}
    >
      {(Object.keys(STATUS_META) as Status[]).map((s) => (
        <option key={s} value={s}>
          {STATUS_META[s].label}
        </option>
      ))}
    </select>
  );
}
