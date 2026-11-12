"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DateSelect from "@/components/catering/DateSelect";
import { BRANCH_DUTY_AMOUNT, BRANCH_DUTY_KINDS, BRANCH_DUTY_LABEL, type BranchDutyKind } from "@/lib/cateringBranchDuty";
import { formatBaht } from "@/lib/format";

export interface DutyRow {
  id: string;
  staffName: string;
  date: string; // YYYY-MM-DD
  kind: BranchDutyKind;
  amount: number;
  branchName: string | null;
  color: { dot: string };
}

const field = "rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white";
const thaiDate = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

/** บันทึกงานสอนงานหน้าสาขา / แทนสาขา ของรอบที่กำลังดู — ค่าข้าวเหมาต่อวันตามหมวด */
export default function BranchDutyManager({
  staffNames,
  duties,
  canEdit,
  periodLabel,
}: {
  staffNames: string[];
  duties: DutyRow[];
  canEdit: boolean;
  periodLabel: string;
}) {
  const router = useRouter();
  const [staffName, setStaffName] = useState("");
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<BranchDutyKind>("TRAINING");
  const [branchName, setBranchName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const year = new Date().getFullYear();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/catering/branch-duties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffName, date, kind, branchName }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    setBranchName("");
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("ลบรายการนี้?")) return;
    setBusy(true);
    await fetch(`/api/catering/branch-duties/${id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  return (
    <section className="mb-5 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-bold text-gray-800">สอนงานหน้าสาขา / แทนสาขา</h2>
      <p className="mb-3 text-xs text-gray-500">
        {BRANCH_DUTY_KINDS.map((k) => `${BRANCH_DUTY_LABEL[k]} ${BRANCH_DUTY_AMOUNT[k]} บาท/วัน`).join(" · ")} — รวมเข้ายอดค่าข้าวของคนนั้นในรอบ {periodLabel}
      </p>

      {canEdit && (
        <form onSubmit={add} className="mb-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-gray-500">พนักงาน</label>
            <select required value={staffName} onChange={(e) => setStaffName(e.target.value)} className={field}>
              <option value="">เลือกคน</option>
              {staffNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">วันที่</label>
            <DateSelect required value={date} onChange={setDate} minYear={year - 1} maxYear={year + 1} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">หมวด</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as BranchDutyKind)} className={field}>
              {BRANCH_DUTY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {BRANCH_DUTY_LABEL[k]} ({BRANCH_DUTY_AMOUNT[k]} ฿)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">สาขา (ไม่บังคับ)</label>
            <input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="เช่น เอ็มควอเทียร์" className={`${field} w-40`} />
          </div>
          <button type="submit" disabled={busy || !date || !staffName} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            + เพิ่ม
          </button>
        </form>
      )}
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {duties.length === 0 ? (
        <p className="text-sm text-gray-400">ยังไม่มีรายการในรอบนี้</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {duties.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 text-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${d.color.dot}`} />
              <span className="font-medium text-gray-800">{d.staffName}</span>
              <span className="text-gray-500">{thaiDate(d.date)}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${d.kind === "COVER" ? "bg-violet-100 text-violet-800" : "bg-teal-100 text-teal-800"}`}>{BRANCH_DUTY_LABEL[d.kind]}</span>
              {d.branchName && <span className="text-xs text-gray-500">{d.branchName}</span>}
              <span className="ml-auto font-semibold text-gray-900">{formatBaht(d.amount)} ฿</span>
              {canEdit && (
                <button onClick={() => remove(d.id)} disabled={busy} className="text-xs text-red-500 hover:underline disabled:opacity-50">
                  ลบ
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
