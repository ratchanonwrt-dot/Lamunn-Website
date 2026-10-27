"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** ตั้ง "รับงานได้สูงสุดกี่งานต่อวัน" — ใช้ตัดสินว่าวันไหนในปฏิทินขึ้น "เต็ม" */
export default function CapacityForm({ value, canEdit }: { value: number; canEdit: boolean }) {
  const router = useRouter();
  const [val, setVal] = useState(String(value));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    const res = await fetch("/api/catering/capacity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: val }),
    });
    setState(res.ok ? "saved" : "error");
    if (res.ok) router.refresh();
  }

  if (!canEdit) return <span className="text-xs text-gray-500">รับได้สูงสุด {value} งาน/วัน</span>;

  return (
    <form onSubmit={save} className="flex items-center gap-2 text-xs text-gray-500">
      รับได้สูงสุด
      <input type="number" min={1} max={50} value={val} onChange={(e) => setVal(e.target.value)} className="w-14 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-right text-sm text-gray-800" />
      งาน/วัน
      <button type="submit" disabled={state === "saving" || val === String(value)} className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40">
        {state === "saving" ? "..." : "บันทึก"}
      </button>
      {state === "saved" && <span className="text-emerald-600">บันทึกแล้ว</span>}
      {state === "error" && <span className="text-red-600">ไม่สำเร็จ</span>}
    </form>
  );
}
