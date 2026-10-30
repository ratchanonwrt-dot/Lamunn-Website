"use client";

import { useCallback, useState } from "react";
import { formatBaht } from "@/lib/format";
import { useCanEdit } from "@/lib/RoleContext";
import { useCellSave, cellStatusClass } from "@/lib/useCellSave";

interface DayDetail {
  storefront: number;
  grab: number;
  lineman: number;
  shopee: number;
  cashPos: number | null;
  transfer: number | null;
  cashTransferCombined: number | null;
  cashCounted: number | null;
  posCheckTotal: number | null;
  note: string | null;
}

interface BranchRow {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  type: "CASH" | "CREDIT_TERM";
}

/** ค่าที่ผู้ใช้เพิ่งกรอก (ยังไม่ผ่านการ refresh จากเซิร์ฟเวอร์) — เก็บเฉพาะฟิลด์ที่แก้ */
type Edit = Partial<Omit<DayDetail, "storefront">>;
/** ตารางเรียกตอนออกจากช่อง: ใส่ค่าใหม่ลง state ของตารางทันที (ก่อนเซิร์ฟเวอร์ตอบ) ให้ยอดรวมขยับเลย */
type Commit = (patch: Edit) => void;

// ทุกเซลล์บันทึกทันทีตอนออกจากช่อง (blur) แบบไม่บล็อก — ช่องไม่ถูก disable ระหว่างรอ
// ผู้ใช้กด Tab กรอกช่องถัดไปได้เลย สีของช่องบอกสถานะแทน (ดู lib/useCellSave.ts)
//
// ยอดรวมของแถว / รวมทุกสาขา / "รวมวันนี้" คำนวณจาก state ฝั่ง client ที่รวมค่าที่เพิ่งกรอกเข้าไปแล้ว
// (optimistic) จึงเปลี่ยนทันทีที่ออกจากช่อง ไม่ต้องรอ POST + router.refresh (~0.5-1 วิ) เหมือนก่อน
// ถ้าเซิร์ฟเวอร์ปฏิเสธ ค่าจะถูกย้อนกลับเป็นค่าเดิมและช่องขึ้นสีแดง
const inputBase = "rounded-lg border px-2 py-2 text-right text-sm outline-none transition-colors md:py-1";

function toNum(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// เซลล์แก้ไข Grab / Lineman / Shopee — ค่าเดียว
function SimpleAmountCell({
  branchId,
  date,
  field,
  value,
  onCommit,
}: {
  branchId: string;
  date: string;
  field: "grab" | "lineman" | "shopee";
  value: number;
  onCommit: Commit;
}) {
  const canEdit = useCanEdit("MONTHLY");
  const [val, setVal] = useState(value.toString());
  const { status, save } = useCellSave("/api/daily-sales");

  async function handleBlur() {
    if (Number(val) === value) return;
    const previous = value;
    onCommit({ [field]: toNum(val) });
    const ok = await save({ branchId, date, [field]: val, overrideGrab: field === "grab", overrideLineman: field === "lineman", overrideShopee: field === "shopee" });
    if (!ok) onCommit({ [field]: previous });
  }

  if (!canEdit) return <span>{value ? formatBaht(value) : "-"}</span>;

  return (
    <input
      type="number"
      step="0.01"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={handleBlur}
      className={`w-24 ${inputBase} ${cellStatusClass(status)}`}
    />
  );
}

// เซลล์แก้ไขหน้าร้าน — CASH แยกเงินสด/เงินโอน 2 ช่อง, Credit Term รวมช่องเดียว
function StorefrontCell({
  branchId,
  date,
  type,
  d,
  onCommit,
}: {
  branchId: string;
  date: string;
  type: "CASH" | "CREDIT_TERM";
  d: DayDetail;
  onCommit: Commit;
}) {
  const canEdit = useCanEdit("MONTHLY");
  const [cashPos, setCashPos] = useState((d.cashPos ?? 0).toString());
  const [transfer, setTransfer] = useState((d.transfer ?? 0).toString());
  const [combined, setCombined] = useState((d.cashTransferCombined ?? 0).toString());
  const { status, save } = useCellSave("/api/daily-sales");

  async function handleBlurCash() {
    if (type === "CASH" && Number(cashPos) === (d.cashPos ?? 0) && Number(transfer) === (d.transfer ?? 0)) return;
    if (type === "CREDIT_TERM" && Number(combined) === (d.cashTransferCombined ?? 0)) return;
    const previous: Edit = { cashPos: d.cashPos, transfer: d.transfer, cashTransferCombined: d.cashTransferCombined };
    onCommit(type === "CASH" ? { cashPos: toNum(cashPos), transfer: toNum(transfer) } : { cashTransferCombined: toNum(combined) });
    const ok = await save(
      type === "CASH"
        ? { branchId, date, cashPos, transfer, overrideStorefront: true }
        : { branchId, date, cashTransferCombined: combined, overrideStorefront: true }
    );
    if (!ok) onCommit(previous);
  }

  if (!canEdit) return <span>{d.storefront ? formatBaht(d.storefront) : "-"}</span>;

  if (type === "CREDIT_TERM") {
    return (
      <input
        type="number"
        step="0.01"
        value={combined}
        onChange={(e) => setCombined(e.target.value)}
        onBlur={handleBlurCash}
        className={`w-24 ${inputBase} ${cellStatusClass(status)}`}
      />
    );
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <input
        type="number"
        step="0.01"
        title="เงินสด POS"
        value={cashPos}
        onChange={(e) => setCashPos(e.target.value)}
        onBlur={handleBlurCash}
        className={`w-16 rounded-lg border px-1.5 py-2 text-right text-xs outline-none transition-colors md:py-1 ${cellStatusClass(status)}`}
      />
      <span className="text-gray-300">+</span>
      <input
        type="number"
        step="0.01"
        title="เงินโอน"
        value={transfer}
        onChange={(e) => setTransfer(e.target.value)}
        onBlur={handleBlurCash}
        className={`w-16 rounded-lg border px-1.5 py-2 text-right text-xs outline-none transition-colors md:py-1 ${cellStatusClass(status)}`}
      />
    </div>
  );
}

// เซลล์แก้ไขเงินสดนับ (ส่งกลับครัวกลาง) — เฉพาะสาขา CASH เท่านั้น
function CashCountedCell({ branchId, date, value, onCommit }: { branchId: string; date: string; value: number | null; onCommit: Commit }) {
  const canEdit = useCanEdit("MONTHLY");
  const [val, setVal] = useState((value ?? 0).toString());
  const { status, save } = useCellSave("/api/daily-sales");

  async function handleBlur() {
    if (Number(val) === (value ?? 0)) return;
    const previous = value;
    onCommit({ cashCounted: val === "" ? null : toNum(val) });
    const ok = await save({ branchId, date, cashCounted: val, overrideCashCounted: true });
    if (!ok) onCommit({ cashCounted: previous });
  }

  if (!canEdit) return <span>{value ? formatBaht(value) : "-"}</span>;

  return (
    <input
      type="number"
      step="0.01"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={handleBlur}
      className={`w-24 ${inputBase} ${cellStatusClass(status)}`}
    />
  );
}

// เซลล์แก้ไขยอดรวม POS (เช็คยอด, ไม่บังคับ) — ใช้ในหน้าเช็คยอด POS
function PosCheckCell({ branchId, date, value, onCommit }: { branchId: string; date: string; value: number | null; onCommit: Commit }) {
  const canEdit = useCanEdit("MONTHLY");
  const [val, setVal] = useState((value ?? "").toString());
  const { status, save } = useCellSave("/api/daily-sales");

  async function handleBlur() {
    if (val === (value ?? "").toString()) return;
    const previous = value;
    onCommit({ posCheckTotal: val === "" ? null : toNum(val) });
    const ok = await save({ branchId, date, posCheckTotal: val });
    if (!ok) onCommit({ posCheckTotal: previous });
  }

  if (!canEdit) return <span>{value ? formatBaht(value) : "-"}</span>;

  return (
    <input
      type="number"
      step="0.01"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={handleBlur}
      className={`w-24 ${inputBase} ${cellStatusClass(status)}`}
    />
  );
}

// เซลล์แก้ไขหมายเหตุ
function NoteCell({ branchId, date, value, onCommit }: { branchId: string; date: string; value: string | null; onCommit: Commit }) {
  const canEdit = useCanEdit("MONTHLY");
  const [val, setVal] = useState(value ?? "");
  const { status, save } = useCellSave("/api/daily-sales");

  async function handleBlur() {
    if (val === (value ?? "")) return;
    const previous = value;
    onCommit({ note: val || null });
    const ok = await save({ branchId, date, note: val });
    if (!ok) onCommit({ note: previous });
  }

  if (!canEdit) return <span>{value || "-"}</span>;

  return (
    <input
      type="text"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={handleBlur}
      className={`w-32 rounded-lg border px-2 py-2 text-sm outline-none transition-colors md:py-1 ${cellStatusClass(status)}`}
    />
  );
}

const emptyDetail: DayDetail = {
  storefront: 0,
  grab: 0,
  lineman: 0,
  shopee: 0,
  cashPos: null,
  transfer: null,
  cashTransferCombined: null,
  cashCounted: null,
  posCheckTotal: null,
  note: null,
};

/** รวมค่าจากเซิร์ฟเวอร์กับค่าที่เพิ่งกรอก แล้วคำนวณ "หน้าร้าน" ใหม่ให้ตรงสูตรเดียวกับฝั่งเซิร์ฟเวอร์
 * (CASH = เงินสด POS + เงินโอน, Credit Term = ช่องรวมช่องเดียว) */
function mergeDetail(base: DayDetail, edit: Edit | undefined, type: "CASH" | "CREDIT_TERM"): DayDetail {
  if (!edit) return base;
  const merged = { ...base, ...edit };
  merged.storefront = type === "CASH" ? (merged.cashPos ?? 0) + (merged.transfer ?? 0) : merged.cashTransferCombined ?? 0;
  return merged;
}

export default function BranchDailyMatrix({
  branches,
  dateKeys,
  dayLabels,
  detail,
  defaultDateKey,
}: {
  branches: BranchRow[];
  dateKeys: string[]; // "YYYY-MM-DD" เรียงจากวันที่ 1 ถึงวันสุดท้ายของเดือน
  dayLabels: Record<string, string>;
  detail: Record<string, DayDetail>; // key: `${branchId}_${dateKey}`
  defaultDateKey: string;
}) {
  const [selectedDate, setSelectedDate] = useState(defaultDateKey);
  // ค่าที่กรอกแล้วแต่ยังไม่ได้ผ่าน refresh จากเซิร์ฟเวอร์ (key เดียวกับ detail) — หลัง refresh ค่าใน detail
  // จะเท่ากับตรงนี้อยู่แล้ว เก็บซ้อนไว้ไม่เป็นไร ถ้าบันทึกไม่ผ่านเซลล์จะ commit ค่าเดิมกลับมาทับเอง
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const commitEdit = useCallback((key: string, patch: Edit) => {
    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  const index = dateKeys.indexOf(selectedDate);

  function go(delta: number) {
    const next = index + delta;
    if (next >= 0 && next < dateKeys.length) setSelectedDate(dateKeys[next]);
  }

  const rows = branches.map((b) => {
    const key = `${b.id}_${selectedDate}`;
    const d = mergeDetail(detail[key] ?? emptyDetail, edits[key], b.type);
    return { ...b, key, d, total: d.storefront + d.grab + d.lineman + d.shopee };
  });
  const grandTotal = {
    storefront: rows.reduce((a, r) => a + r.d.storefront, 0),
    grab: rows.reduce((a, r) => a + r.d.grab, 0),
    lineman: rows.reduce((a, r) => a + r.d.lineman, 0),
    shopee: rows.reduce((a, r) => a + r.d.shopee, 0),
    total: rows.reduce((a, r) => a + r.total, 0),
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => go(-1)}
            disabled={index <= 0}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30"
          >
            ←
          </button>
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-800 outline-none focus:border-brand-400"
          >
            {dateKeys.map((d) => (
              <option key={d} value={d}>
                {dayLabels[d] ?? d}
              </option>
            ))}
          </select>
          <button
            onClick={() => go(1)}
            disabled={index >= dateKeys.length - 1}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30"
          >
            →
          </button>
        </div>
        <p className="text-sm font-semibold text-brand-700">รวมวันนี้ {formatBaht(grandTotal.total)} บาท</p>
      </div>

      <p className="mb-2 text-xs text-gray-400">
        แก้ไขตัวเลขในตารางได้เลย บันทึกอัตโนมัติเมื่อออกจากช่อง — กด Tab กรอกช่องถัดไปได้ทันทีไม่ต้องรอ (เหลือง = กำลังบันทึก, เขียว = สำเร็จ, แดง = ไม่สำเร็จ ลองกรอกใหม่)
        สาขาที่เชื่อม IMS แล้ว การแก้ตรงนี้จะไม่ถูกดึงทับอีก
      </p>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2">สาขา</th>
              <th className="px-3 py-2 text-right">หน้าร้าน</th>
              <th className="px-3 py-2 text-right">Grab</th>
              <th className="px-3 py-2 text-right">Lineman</th>
              <th className="px-3 py-2 text-right">Shopee</th>
              <th className="px-3 py-2 text-right">เงินสดนับ</th>
              <th className="px-3 py-2 text-right">เช็คยอด POS</th>
              <th className="px-3 py-2 text-right font-semibold">รวม</th>
              <th className="px-3 py-2">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const onCommit: Commit = (patch) => commitEdit(r.key, patch);
              return (
                <tr key={`${r.id}-${selectedDate}`} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-medium text-gray-800">
                    {r.name}
                    {!r.isActive && <span className="ml-1 text-[10px] font-normal text-gray-400">(ปิด)</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">
                    <StorefrontCell branchId={r.id} date={selectedDate} type={r.type} d={r.d} onCommit={onCommit} />
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">
                    <SimpleAmountCell branchId={r.id} date={selectedDate} field="grab" value={r.d.grab} onCommit={onCommit} />
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">
                    <SimpleAmountCell branchId={r.id} date={selectedDate} field="lineman" value={r.d.lineman} onCommit={onCommit} />
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">
                    <SimpleAmountCell branchId={r.id} date={selectedDate} field="shopee" value={r.d.shopee} onCommit={onCommit} />
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">
                    {r.type === "CASH" ? (
                      <CashCountedCell branchId={r.id} date={selectedDate} value={r.d.cashCounted} onCommit={onCommit} />
                    ) : (
                      <span>-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">
                    <PosCheckCell branchId={r.id} date={selectedDate} value={r.d.posCheckTotal} onCommit={onCommit} />
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-800">{r.total ? formatBaht(r.total) : "-"}</td>
                  <td className="px-3 py-2">
                    <NoteCell branchId={r.id} date={selectedDate} value={r.d.note} onCommit={onCommit} />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-gray-400" colSpan={9}>
                  ยังไม่มีข้อมูล
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-800">
              <td className="px-3 py-2">รวมทุกสาขา</td>
              <td className="px-3 py-2 text-right">{formatBaht(grandTotal.storefront)}</td>
              <td className="px-3 py-2 text-right">{formatBaht(grandTotal.grab)}</td>
              <td className="px-3 py-2 text-right">{formatBaht(grandTotal.lineman)}</td>
              <td className="px-3 py-2 text-right">{formatBaht(grandTotal.shopee)}</td>
              <td className="px-3 py-2" />
              <td className="px-3 py-2" />
              <td className="px-3 py-2 text-right text-brand-700">{formatBaht(grandTotal.total)}</td>
              <td className="px-3 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
