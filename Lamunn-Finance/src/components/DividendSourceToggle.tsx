"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DIVIDEND_SOURCES, DIVIDEND_SOURCE_LABEL, type DividendSource } from "@/lib/dividendSource";

/** ติ๊กในตารางว่าปันผลรายการนี้จ่ายจากเงินสดหรือบัญชีบริษัท — เปลี่ยนสีทันทีที่กด แล้วค่อยรีเฟรชยอดรวมจากเซิร์ฟเวอร์
 * กดตัวที่เลือกอยู่ซ้ำ = ล้างกลับเป็น "ยังไม่ระบุ" */
export default function DividendSourceToggle({ id, source }: { id: string; source: DividendSource | null }) {
  const router = useRouter();
  const [value, setValue] = useState<DividendSource | null>(source);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  async function pick(next: DividendSource) {
    const target = value === next ? null : next;
    const previous = value;
    setValue(target);
    setState("saving");
    const res = await fetch(`/api/dividend-payments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: target }),
    });
    if (!res.ok) {
      setValue(previous);
      setState("error");
      return;
    }
    setState("idle");
    router.refresh();
  }

  return (
    <div className={`inline-flex rounded-lg p-0.5 ${state === "error" ? "bg-red-100" : "bg-gray-100"}`}>
      {DIVIDEND_SOURCES.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => pick(s)}
          disabled={state === "saving"}
          className={`rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-60 ${value === s ? (s === "CASH" ? "bg-amber-500 text-white" : "bg-sky-600 text-white") : "text-gray-500 hover:text-gray-700"}`}
        >
          {DIVIDEND_SOURCE_LABEL[s]}
        </button>
      ))}
    </div>
  );
}
