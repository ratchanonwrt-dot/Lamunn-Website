"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, UserPlus } from "lucide-react";
import { useCanEdit } from "@/lib/RoleContext";

interface Staff {
  id: string;
  name: string;
  dayOffs: string;
  otRatePerHour: number;
  dayOffRatePerHour: number | null;
  isActive: boolean;
}

// เรียงจันทร์ → อาทิตย์ แบบตารางกะงาน ค่าจริงเก็บเลขวันของ JS (0 = อาทิตย์)
const WEEK = [
  { d: 1, label: "จ" },
  { d: 2, label: "อ" },
  { d: 3, label: "พ" },
  { d: 4, label: "พฤ" },
  { d: 5, label: "ศ" },
  { d: 6, label: "ส" },
  { d: 0, label: "อา" },
];

function parse(s: string) {
  return new Set(
    s
      .split(",")
      .map((x) => Number(x))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6 && s !== "")
  );
}

const numCls = "w-20 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-right text-sm outline-none focus:border-brand-400 focus:bg-white disabled:opacity-60";

function StaffRow({ s }: { s: Staff }) {
  const router = useRouter();
  const canEdit = useCanEdit("CATERING");
  const [name, setName] = useState(s.name);
  const [offs, setOffs] = useState(parse(s.dayOffs));
  const [rate, setRate] = useState(String(s.otRatePerHour));
  const [offRate, setOffRate] = useState(s.dayOffRatePerHour != null ? String(s.dayOffRatePerHour) : "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save(patch: Record<string, unknown>) {
    setState("saving");
    setError(null);
    const res = await fetch(`/api/catering/staff/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "บันทึกไม่สำเร็จ");
      setState("error");
      return;
    }
    setState("saved");
    router.refresh();
    setTimeout(() => setState("idle"), 1200);
  }

  function toggleDay(d: number) {
    const next = new Set(offs);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    setOffs(next);
    void save({ dayOffs: [...next].join(",") });
  }

  async function remove() {
    if (!confirm(`ลบ ${s.name} ออกจากรายชื่อ? (ประวัติการไปงานยังอยู่)`)) return;
    await fetch(`/api/catering/staff/${s.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3 ${s.isActive ? "border-gray-200" : "border-dashed border-gray-200 opacity-60"} ${state === "error" ? "ring-2 ring-red-200" : state === "saved" ? "ring-2 ring-emerald-200" : ""}`}>
      <input
        disabled={!canEdit}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== s.name && save({ name })}
        className="w-36 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm font-semibold text-gray-900 outline-none hover:border-gray-200 focus:border-brand-400 focus:bg-white"
      />
      <div className="flex items-center gap-1" title="วันหยุดประจำสัปดาห์">
        <span className="mr-1 text-[11px] text-gray-400">หยุด</span>
        {WEEK.map((w) => (
          <button
            key={w.d}
            type="button"
            disabled={!canEdit}
            onClick={() => toggleDay(w.d)}
            className={`h-7 w-7 rounded-full text-xs font-semibold transition ${offs.has(w.d) ? "bg-rose-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
          >
            {w.label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5 text-[11px] text-gray-500">
        OT
        <input type="number" min={0} step="1" disabled={!canEdit} value={rate} onChange={(e) => setRate(e.target.value)} onBlur={() => Number(rate) !== s.otRatePerHour && save({ otRatePerHour: rate })} className={numCls} />
        ฿/ชม.
      </label>
      <label className="flex items-center gap-1.5 text-[11px] text-gray-500">
        วันหยุด
        <input
          type="number"
          min={0}
          step="1"
          disabled={!canEdit}
          value={offRate}
          placeholder={rate || "0"}
          onChange={(e) => setOffRate(e.target.value)}
          onBlur={() => offRate !== (s.dayOffRatePerHour != null ? String(s.dayOffRatePerHour) : "") && save({ dayOffRatePerHour: offRate })}
          className={numCls}
        />
        ฿/ชม.
      </label>
      <div className="ml-auto flex items-center gap-2">
        {state === "saving" && <span className="text-[11px] text-amber-500">กำลังบันทึก…</span>}
        {error && <span className="text-[11px] text-red-600">{error}</span>}
        {canEdit && (
          <>
            <button type="button" onClick={() => save({ isActive: !s.isActive })} className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${s.isActive ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
              {s.isActive ? "ทำงานอยู่" : "พักไว้"}
            </button>
            <button type="button" onClick={remove} className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500" aria-label={`ลบ ${s.name}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** รายชื่อพนักงาน Catering: ชื่อ · วันหยุดประจำสัปดาห์ (กดวงกลมวัน) · ค่า OT ต่อชั่วโมง วันปกติ / วันหยุด — แก้แล้วบันทึกทันที */
export default function StaffRosterManager({ staff, suggestNames = [] }: { staff: Staff[]; suggestNames?: string[] }) {
  const router = useRouter();
  const canEdit = useCanEdit("CATERING");
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(n: string, r = rate) {
    if (!n.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/catering/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n.trim(), otRatePerHour: r || 0 }) });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "เพิ่มไม่สำเร็จ");
      return;
    }
    setName("");
    setRate("");
    router.refresh();
  }

  return (
    <div>
      {canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void add(name);
          }}
          className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-brand-300 bg-brand-50/50 p-3"
        >
          <UserPlus className="h-4 w-4 text-brand-600" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อพนักงานใหม่" className="w-44 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-400" />
          <input type="number" min={0} value={rate} onChange={(e) => setRate(e.target.value)} placeholder="OT ฿/ชม." className="w-28 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-right text-sm outline-none focus:border-brand-400" />
          <button type="submit" disabled={busy || !name.trim()} className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            + เพิ่ม
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </form>
      )}

      {canEdit && suggestNames.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-gray-500">ชื่อที่เคยไปงานแต่ยังไม่อยู่ในรายชื่อ:</span>
          {suggestNames.map((n) => (
            <button key={n} type="button" disabled={busy} onClick={() => add(n, "")} className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-gray-700 hover:border-brand-300 hover:bg-brand-50">
              + {n}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {staff.map((s) => (
          <StaffRow key={`${s.id}-${s.name}`} s={s} />
        ))}
        {staff.length === 0 && <p className="rounded-xl bg-white p-6 text-center text-sm text-gray-400">ยังไม่มีรายชื่อ — เพิ่มด้านบน</p>}
      </div>
    </div>
  );
}
