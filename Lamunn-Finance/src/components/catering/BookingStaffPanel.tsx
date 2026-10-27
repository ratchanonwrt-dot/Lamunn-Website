"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Assignment {
  id: string;
  staffName: string | null;
  staff: { id: string; name: string } | null;
  otHours?: number | null;
}

/** ช่องชั่วโมง OT ของคนนี้ในงานนี้ — ว่าง = ใช้ชั่วโมงจากเวลางาน (ตัวเลขจางในช่อง) แก้แล้วบันทึกตอนออกจากช่อง */
function HoursInput({ bookingId, a, defaultHours }: { bookingId: string; a: Assignment; defaultHours: number | null }) {
  const router = useRouter();
  const [val, setVal] = useState(a.otHours != null ? String(a.otHours) : "");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  async function save() {
    if (val === (a.otHours != null ? String(a.otHours) : "")) return;
    setState("saving");
    const res = await fetch(`/api/catering/bookings/${bookingId}/staff/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otHours: val === "" ? null : val }),
    });
    setState(res.ok ? "idle" : "error");
    if (res.ok) router.refresh();
  }
  return (
    <input
      type="number"
      min={0}
      step="0.5"
      value={val}
      placeholder={defaultHours != null ? String(defaultHours) : "ชม."}
      title="ชั่วโมง OT ของงานนี้ (ว่าง = คิดจากเวลางาน)"
      onChange={(e) => setVal(e.target.value)}
      onBlur={save}
      className={`w-14 rounded-md border bg-white px-1.5 py-0.5 text-right text-xs outline-none focus:border-brand-400 ${state === "error" ? "border-red-400" : state === "saving" ? "border-amber-300" : "border-gray-200"}`}
    />
  );
}

/** เลือกพนักงานที่จะส่งไปงาน — กดชื่อที่เคยใช้ได้เลย หรือพิมพ์ชื่อใหม่เพิ่ม (ชื่อใหม่จะขึ้นเป็นตัวเลือกครั้งต่อไปเอง)
 * busyNames = คนที่ถูกจัดไปงานอื่นในวันเดียวกันแล้ว — เตือนไว้กันส่งคนเดียวไปสองงานพร้อมกัน */
export default function BookingStaffPanel({
  bookingId,
  assignments,
  knownNames = [],
  busyNames = {},
  servings = null,
  required = 1,
  offNames = {},
  defaultHours = null,
}: {
  bookingId: string;
  assignments: Assignment[];
  knownNames?: string[];
  busyNames?: Record<string, string>; // ชื่อ (ตัวเล็ก) → งานอื่นที่ไปวันเดียวกัน
  servings?: number | null;
  required?: number; // คนขั้นต่ำตามกฎ 75 เสิร์ฟ/คน (lib/cateringCalendar.ts)
  offNames?: Record<string, string>; // ชื่อ (ตัวเล็ก) → วันหยุดที่ตรงกับงานนี้ เช่น "ส." — ไปได้แต่คิด OT อัตราวันหยุด
  defaultHours?: number | null; // ชั่วโมง OT ตั้งต้นจากเวลางาน × จำนวนวัน
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const assigned = new Set(assignments.map((a) => (a.staffName ?? a.staff?.name ?? "").trim().toLowerCase()));

  async function add(staffName: string) {
    const clean = staffName.trim();
    if (!clean || assigned.has(clean.toLowerCase())) return;
    setSaving(clean);
    await fetch(`/api/catering/bookings/${bookingId}/staff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffName: clean }),
    });
    setSaving(null);
    setName("");
    router.refresh();
  }

  async function handleRemove(assignmentId: string) {
    await fetch(`/api/catering/bookings/${bookingId}/staff/${assignmentId}`, { method: "DELETE" });
    router.refresh();
  }

  const suggestions = knownNames.filter((n) => !assigned.has(n.toLowerCase()));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">
        พนักงานที่ส่งไปงานนี้ ({assignments.length}/{required} คน)
      </h2>
      <p className="mb-3 text-xs text-gray-500">
        ช่องตัวเลขข้างชื่อ = ชั่วโมง OT ของงานนี้ (ว่างไว้ = คิดจากเวลางาน{defaultHours != null ? ` ${defaultHours} ชม.` : ""}) · กฎ: ทุก 75 เสิร์ฟต้องมีพนักงาน 1 คน{servings ? ` — งานนี้ ${servings} เสิร์ฟ ต้องมีอย่างน้อย ${required} คน` : " — ยังไม่ได้กรอกจำนวนเสิร์ฟ (คิดขั้นต่ำ 1 คน)"}
      </p>
      {assignments.length < required && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">คนยังไม่พอ — ต้องเพิ่มอีก {required - assignments.length} คน</p>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {assignments.map((a) => {
          const n = a.staffName ?? a.staff?.name ?? "";
          const clash = busyNames[n.trim().toLowerCase()];
          const off = offNames[n.trim().toLowerCase()];
          return (
            <span key={a.id} className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${clash ? "bg-red-50 text-red-700" : "bg-brand-50 text-brand-800"}`}>
              <span className="font-medium">{n}</span>
              {off && <span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold text-white">วันหยุด {off}</span>}
              {clash && <span className="text-[11px]">มีงาน {clash} วันเดียวกัน</span>}
              <HoursInput bookingId={bookingId} a={a} defaultHours={defaultHours} />
              <span className="text-[10px] opacity-60">ชม.</span>
              <button onClick={() => handleRemove(a.id)} className="text-xs text-gray-400 hover:text-red-500" aria-label={`เอา ${n} ออก`}>
                ✕
              </button>
            </span>
          );
        })}
        {assignments.length === 0 && <p className="text-sm text-gray-400">ยังไม่ได้เลือกพนักงาน</p>}
      </div>

      {suggestions.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs text-gray-500">กดชื่อเพื่อเพิ่ม</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((n) => {
              const clash = busyNames[n.toLowerCase()];
              const off = offNames[n.toLowerCase()];
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => add(n)}
                  disabled={saving !== null}
                  title={clash ? `มีงาน ${clash} วันเดียวกันแล้ว` : undefined}
                  className={`rounded-full border px-3 py-1 text-sm disabled:opacity-50 ${clash ? "border-red-200 text-red-400 hover:bg-red-50" : "border-gray-200 text-gray-700 hover:border-brand-300 hover:bg-brand-50"}`}
                >
                  {saving === n ? "..." : `+ ${n}`}
                  {clash && <span className="ml-1 text-[10px]">(ติดงาน)</span>}
                  {off && !clash && <span className="ml-1 text-[10px] text-rose-500">(วันหยุด)</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add(name);
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">เพิ่มชื่อใหม่</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น พี่แนน, น้องมิ้นท์"
            className="w-56 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white"
          />
        </div>
        <button type="submit" disabled={saving !== null || !name.trim()} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          + เพิ่ม
        </button>
      </form>
    </div>
  );
}
