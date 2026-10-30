"use client";

import { useCallback, useState } from "react";
import { formatBaht } from "@/lib/format";
import { useCanEdit } from "@/lib/RoleContext";
import { useCellSave, cellStatusClass } from "@/lib/useCellSave";

interface DayRow {
  date: string; // yyyy-mm-dd
  dayLabel: string;
  storefrontTotal: number;
  grab: number;
  lineman: number;
  shopee: number;
  tiktok: number;
  fbLine: number;
  pickup: number;
  catering: number;
  depositGrab: number | null;
  depositLineman: number | null;
  depositStorefront: number | null;
  depositEcom: number | null;
  note: string | null;
}

type NumericField = "tiktok" | "fbLine" | "pickup" | "catering" | "depositGrab" | "depositLineman" | "depositStorefront" | "depositEcom";
/** ค่าที่ผู้ใช้เพิ่งกรอกในแถวนั้น (ยังไม่ผ่าน refresh จากเซิร์ฟเวอร์) */
type Edit = Partial<Record<NumericField, number | null>>;

// Maps the field name to the API's corresponding override flag param — an inline single-
// cell edit is always a deliberate change, so it always marks that channel as overridden
// (the IMS sync will then leave it alone from here on). Deposit/note fields have no auto-sync
// to guard against, so they're written unconditionally with no override flag.
const OVERRIDE_PARAM: Record<string, string> = {
  tiktok: "overrideTiktok",
  fbLine: "overrideFbLine",
  pickup: "overridePickup",
  catering: "overrideCatering",
};

// บันทึกแบบไม่บล็อก + รวม refresh หลายช่องเป็นครั้งเดียวหลังหยุดกรอก (ดู lib/useCellSave.ts)
// ยอด "รวมวันนั้น" คำนวณจาก state ฝั่ง client ที่รวมค่าที่เพิ่งกรอกแล้ว (optimistic) จึงขยับทันทีที่ออกจากช่อง
// ไม่ต้องรอเซิร์ฟเวอร์ — ถ้าบันทึกไม่ผ่านจะย้อนค่าเดิมกลับและช่องขึ้นสีแดง
function EditableCell({
  date,
  field,
  value,
  onCommit,
}: {
  date: string;
  field: NumericField;
  value: number | null;
  onCommit: (field: NumericField, value: number | null) => void;
}) {
  const canEdit = useCanEdit("MONTHLY");
  const [val, setVal] = useState((value ?? "").toString());
  const { status, save } = useCellSave("/api/company-channel");

  async function handleBlur() {
    if (val === (value ?? "").toString()) return;
    const overrideParam = OVERRIDE_PARAM[field];
    const previous = value;
    const next = val === "" ? null : Number(val);
    onCommit(field, Number.isFinite(next as number) ? next : null);
    const ok = await save({ date, [field]: val, ...(overrideParam ? { [overrideParam]: true } : {}) });
    if (!ok) onCommit(field, previous);
  }

  return (
    <input
      type="number"
      step="0.01"
      value={val}
      disabled={!canEdit}
      onChange={(e) => setVal(e.target.value)}
      onBlur={handleBlur}
      className={`w-24 rounded-lg border px-2 py-1 text-right text-sm outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${cellStatusClass(status)}`}
    />
  );
}

function NoteCell({ date, value }: { date: string; value: string | null }) {
  const canEdit = useCanEdit("MONTHLY");
  const [val, setVal] = useState(value ?? "");
  const { status, save } = useCellSave("/api/company-channel");

  function handleBlur() {
    if (val === (value ?? "")) return;
    void save({ date, note: val });
  }

  return (
    <input
      type="text"
      value={val}
      disabled={!canEdit}
      onChange={(e) => setVal(e.target.value)}
      onBlur={handleBlur}
      className={`w-32 rounded-lg border px-2 py-1 text-sm outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${cellStatusClass(status)}`}
    />
  );
}

/** รวมค่าจากเซิร์ฟเวอร์กับค่าที่เพิ่งกรอก — ช่องยอดขาย (TikTok/FB/รับหน้าร้าน/Catering) ว่าง = 0 ตามที่
 * API เก็บ ส่วนช่องเงินเข้าบัญชีว่าง = null (ยังไม่ได้กรอก) เหมือนกัน */
function mergeRow(base: DayRow, edit: Edit | undefined): DayRow {
  if (!edit) return base;
  const r = { ...base };
  for (const field of Object.keys(edit) as NumericField[]) {
    const v = edit[field];
    if (field === "tiktok" || field === "fbLine" || field === "pickup" || field === "catering") r[field] = v ?? 0;
    else r[field] = v ?? null;
  }
  return r;
}

export default function EditableMonthlyChannelTable({ rows }: { rows: DayRow[] }) {
  // ค่าที่กรอกแล้วแต่ยังไม่ได้ผ่าน refresh (key = วันที่) — หลัง refresh ค่าใน rows จะเท่ากันอยู่แล้ว
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  // Shopee เริ่ม 30 ต.ค. 2569 — เดือนที่ไม่มียอด Shopee ไม่ต้องมีคอลัมน์ว่าง
  const hasShopee = rows.some((r) => r.shopee !== 0);
  const commitEdit = useCallback((date: string, field: NumericField, value: number | null) => {
    setEdits((prev) => ({ ...prev, [date]: { ...prev[date], [field]: value } }));
  }, []);

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[1400px] text-sm">
        <thead className="bg-gray-50 text-left text-gray-500">
          <tr>
            <th className="px-3 py-2">วันที่</th>
            <th className="px-3 py-2 text-right">หน้าร้านรวม (ทุกสาขา)</th>
            <th className="px-3 py-2 text-right">Grab</th>
            <th className="px-3 py-2 text-right">Lineman</th>
            {hasShopee && <th className="px-3 py-2 text-right">Shopee</th>}
            <th className="px-3 py-2 text-right">TikTok</th>
            <th className="px-3 py-2 text-right">FB / Line</th>
            <th className="px-3 py-2 text-right">รับหน้าร้าน</th>
            <th className="px-3 py-2 text-right">Catering</th>
            <th className="px-3 py-2 text-right">รวมวันนั้น</th>
            <th className="px-3 py-2 text-right">เข้าบัญชี Grab</th>
            <th className="px-3 py-2 text-right">เข้าบัญชี Lineman</th>
            <th className="px-3 py-2 text-right">เข้าบัญชีหน้าร้าน</th>
            <th className="px-3 py-2 text-right">เข้าบัญชี E-Com</th>
            <th className="px-3 py-2">หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((base) => {
            const r = mergeRow(base, edits[base.date]);
            const total = r.storefrontTotal + r.grab + r.lineman + r.shopee + r.tiktok + r.fbLine + r.pickup + r.catering;
            const onCommit = (field: NumericField, value: number | null) => commitEdit(r.date, field, value);
            return (
              <tr key={r.date} className="border-t border-gray-100">
                <td className="px-3 py-1.5 whitespace-nowrap">{r.dayLabel}</td>
                <td className="px-3 py-1.5 text-right text-gray-500">{formatBaht(r.storefrontTotal)}</td>
                <td className="px-3 py-1.5 text-right text-gray-500">{formatBaht(r.grab)}</td>
                <td className="px-3 py-1.5 text-right text-gray-500">{formatBaht(r.lineman)}</td>
                {hasShopee && <td className="px-3 py-1.5 text-right text-gray-500">{formatBaht(r.shopee)}</td>}
                <td className="px-3 py-1.5 text-right">
                  <EditableCell date={r.date} field="tiktok" value={r.tiktok} onCommit={onCommit} />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <EditableCell date={r.date} field="fbLine" value={r.fbLine} onCommit={onCommit} />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <EditableCell date={r.date} field="pickup" value={r.pickup} onCommit={onCommit} />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <EditableCell date={r.date} field="catering" value={r.catering} onCommit={onCommit} />
                </td>
                <td className="px-3 py-1.5 text-right font-semibold text-brand-700">{formatBaht(total)}</td>
                <td className="px-3 py-1.5 text-right">
                  <EditableCell date={r.date} field="depositGrab" value={r.depositGrab} onCommit={onCommit} />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <EditableCell date={r.date} field="depositLineman" value={r.depositLineman} onCommit={onCommit} />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <EditableCell date={r.date} field="depositStorefront" value={r.depositStorefront} onCommit={onCommit} />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <EditableCell date={r.date} field="depositEcom" value={r.depositEcom} onCommit={onCommit} />
                </td>
                <td className="px-3 py-1.5">
                  <NoteCell date={r.date} value={r.note} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
