"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import AccountCombobox from "@/components/accounting/AccountCombobox";
import PartnerCombobox from "@/components/accounting/PartnerCombobox";

interface AccountOption {
  id: string;
  code: string;
  nameTh: string;
}

interface BranchOption {
  id: string;
  name: string;
}

interface PartnerOption {
  id: string;
  name: string;
  type: "DEBTOR" | "CREDITOR";
  phone: string | null;
}

interface Line {
  accountId: string;
  debit: string;
  credit: string;
  branchId: string;
  partnerId: string;
  memo: string;
  /** เลขที่ใบกำกับภาษี/เอกสารอ้างอิง — รายงานภาษีซื้อ/ขายใช้เลขนี้แทนเลขที่ใบสำคัญ */
  docNo: string;
}

export interface JournalEntryInitial {
  date: string;
  journalType: string;
  description: string;
  lines: Line[];
}

const JOURNAL_TYPES = [
  { value: "GENERAL", label: "สมุดรายวันทั่วไป" },
  { value: "SALES", label: "สมุดรายวันขาย" },
  { value: "PURCHASE", label: "สมุดรายวันซื้อ" },
  { value: "RECEIPT", label: "สมุดรายวันรับเงิน" },
  { value: "PAYMENT", label: "สมุดรายวันจ่ายเงิน" },
  { value: "ADJUST", label: "ใบสำคัญปรับปรุง" },
];

const emptyLine = (): Line => ({ accountId: "", debit: "", credit: "", branchId: "", partnerId: "", memo: "", docNo: "" });

function satang(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

const fmt = (s: number) => (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ฟอร์มคีย์ใบสำคัญเอง — ตัวเลขเดบิต/เครดิตรวมโชว์สดตลอด และปุ่มบันทึกจะกดไม่ได้จนกว่าจะลงตัว
 * (บังคับกฎบัญชีคู่ตั้งแต่หน้าจอ ไม่ต้องรอ error จากเซิร์ฟเวอร์)
 * ใช้ทั้งคีย์ใหม่ (mode="create") และแก้ไขร่าง (mode="edit" — ต้องส่ง entryId + initial มาด้วย) */
export default function JournalEntryForm({
  accounts,
  branches,
  partners,
  defaultDate,
  descSuggestions = [],
  memoSuggestions = [],
  mode = "create",
  entryId,
  initial,
  autokeyDocumentId,
  autokeyTaxReview,
}: {
  accounts: AccountOption[];
  branches: BranchOption[];
  partners: PartnerOption[];
  defaultDate: string;
  descSuggestions?: string[];
  memoSuggestions?: string[];
  mode?: "create" | "edit";
  entryId?: string;
  initial?: JournalEntryInitial;
  autokeyDocumentId?: string;
  autokeyTaxReview?: { isClaimableVat: boolean; whtFormType: "PND3" | "PND53" | null; whtRatePercent: number | null; incomeType: string | null };
}) {
  const router = useRouter();
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [journalType, setJournalType] = useState(initial?.journalType ?? "GENERAL");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [lines, setLines] = useState<Line[]>(initial?.lines && initial.lines.length >= 2 ? initial.lines : [emptyLine(), emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  // ค้างสถานะ "กำลังบันทึก" ไว้จนหน้าสมุดรายวันขึ้นจอจริง — ของเดิมปุ่มกลับมากดได้ทั้งที่ยังไม่ไปไหน
  const [navigating, startTransition] = useTransition();
  const busy = submitting || navigating;
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const l of lines) {
      debit += satang(l.debit);
      credit += satang(l.credit);
    }
    return { debit, credit, diff: debit - credit };
  }, [lines]);

  const filledLines = lines.filter((l) => l.accountId && (satang(l.debit) !== 0 || satang(l.credit) !== 0));
  const taxReviewReady = !autokeyTaxReview?.whtFormType || ((autokeyTaxReview.whtRatePercent ?? 0) > 0 && Boolean(autokeyTaxReview.incomeType?.trim()));
  const canSave = totals.diff === 0 && totals.debit > 0 && filledLines.length >= 2 && description.trim().length > 0 && taxReviewReady;

  function update(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function submit(postNow: boolean) {
    setSubmitting(true);
    setError(null);
    const url = mode === "edit" ? `/api/accounting/journal/${entryId}` : "/api/accounting/journal";
    const method = mode === "edit" ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, journalType, description, postNow, lines: filledLines, autokeyDocumentId, autokeyTaxReview }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    if (mode === "edit" && !postNow) {
      // แก้ร่างแล้วไม่ผ่านรายการ — กลับไปหน้ารายการ ให้กดผ่านรายการจากตรงนั้นได้เหมือนร่างทั่วไป
      startTransition(() => {
        router.push("/accounting/journal");
        router.refresh();
      });
      return;
    }
    if (mode === "edit" && postNow) {
      // แก้ร่างแล้วกดผ่านรายการทันที — ต้องยิงผ่านรายการอีกครั้งเพราะ PATCH เก็บเป็นร่างเสมอ
      const postRes = await fetch(`/api/accounting/journal/${entryId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "post" }),
      });
      const postData = await postRes.json();
      if (!postRes.ok) {
        setError(postData.error ?? "บันทึกร่างสำเร็จ แต่ผ่านรายการไม่สำเร็จ — ไปกดผ่านรายการที่หน้าสมุดรายวันแทนได้");
        return;
      }
    }
    startTransition(() => {
      router.push("/accounting/journal");
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-gray-500">
          วันที่
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
          />
        </label>
        <label className="text-xs text-gray-500">
          ประเภทสมุดรายวัน
          <select
            value={journalType}
            onChange={(e) => setJournalType(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
          >
            {JOURNAL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          คำอธิบายรายการ
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="เช่น ยอดยกมา ณ 1 ม.ค. 2569"
            list="je-desc-suggestions"
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
          />
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[74rem] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400">
              <th className="py-2 pr-2 text-left font-medium">บัญชี</th>
              <th className="w-28 py-2 px-2 text-right font-medium">เดบิต</th>
              <th className="w-28 py-2 px-2 text-right font-medium">เครดิต</th>
              <th className="w-36 py-2 px-2 text-left font-medium">สาขา (ถ้ามี)</th>
              <th className="w-40 py-2 px-2 text-left font-medium">ซัพพลายเออร์ (ถ้ามี)</th>
              <th className="w-36 py-2 px-2 text-left font-medium">เลขที่ใบกำกับ</th>
              <th className="py-2 px-2 text-left font-medium">หมายเหตุ</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="py-1.5 pr-2">
                  <AccountCombobox accounts={accounts} value={l.accountId} onChange={(accountId) => update(i, { accountId })} />
                </td>
                <td className="py-1.5 px-2">
                  <input
                    inputMode="decimal"
                    value={l.debit}
                    onChange={(e) => update(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-right text-sm tabular-nums text-gray-900"
                  />
                </td>
                <td className="py-1.5 px-2">
                  <input
                    inputMode="decimal"
                    value={l.credit}
                    onChange={(e) => update(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-right text-sm tabular-nums text-gray-900"
                  />
                </td>
                <td className="py-1.5 px-2">
                  <select
                    value={l.branchId}
                    onChange={(e) => update(i, { branchId: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-900"
                  >
                    <option value="">— ไม่ระบุ —</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1.5 px-2">
                  <PartnerCombobox partners={partners} value={l.partnerId} onChange={(partnerId) => update(i, { partnerId })} />
                </td>
                <td className="py-1.5 px-2">
                  {/* ใส่ที่บรรทัดภาษีซื้อ/ขาย — ใบสำคัญใบเดียวมีใบกำกับได้หลายใบ รายงานภาษีจะแยกบรรทัดตามเลขนี้ */}
                  <input
                    value={l.docNo}
                    onChange={(e) => update(i, { docNo: e.target.value })}
                    placeholder="เลขที่ตามใบกำกับ"
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 font-mono text-sm text-gray-900 placeholder:font-sans placeholder:text-gray-300"
                  />
                </td>
                <td className="py-1.5 px-2">
                  <input
                    value={l.memo}
                    onChange={(e) => update(i, { memo: e.target.value })}
                    list="je-memo-suggestions"
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-900"
                  />
                </td>
                <td className="py-1.5 text-right">
                  {lines.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                      className="rounded p-1 text-gray-300 hover:bg-rose-50 hover:text-rose-500"
                      aria-label="ลบบรรทัด"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-800 font-semibold tabular-nums">
              <td className="py-2 pr-2 text-right">รวม</td>
              <td className="py-2 px-2 text-right">{fmt(totals.debit)}</td>
              <td className="py-2 px-2 text-right">{fmt(totals.credit)}</td>
              <td colSpan={5} className="py-2 px-2">
                {totals.diff === 0 ? (
                  totals.debit > 0 && <span className="text-sm font-medium text-emerald-600">✓ ลงตัว</span>
                ) : (
                  <span className="text-sm font-medium text-rose-600">
                    ต่างกัน {fmt(Math.abs(totals.diff))} บาท ({totals.diff > 0 ? "เดบิตเกิน" : "เครดิตเกิน"})
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <button
        type="button"
        onClick={() => setLines((prev) => [...prev, emptyLine()])}
        className="mt-3 flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
      >
        <Plus size={15} /> เพิ่มบรรทัด
      </button>

      {error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="mt-5 flex flex-wrap gap-2">
        {!autokeyDocumentId && <button
          type="button"
          disabled={!canSave || busy}
          onClick={() => submit(true)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
        >
          {busy ? "กำลังบันทึก..." : "บันทึกและผ่านรายการ"}
        </button>
        }
        <button
          type="button"
          disabled={!canSave || busy}
          onClick={() => submit(false)}
          className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40 ${autokeyDocumentId ? "bg-violet-600 text-white hover:bg-violet-700" : "border border-gray-200 text-gray-700 hover:bg-gray-50"}`}
        >
          {busy ? "กำลังบันทึก..." : mode === "edit" ? "บันทึกการแก้ไข (ยังเป็นร่าง)" : autokeyDocumentId ? "ยืนยันและบันทึกเป็นร่าง" : "บันทึกเป็นร่าง"}
        </button>
        {mode === "edit" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => startTransition(() => router.push("/accounting/journal"))}
            className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-50"
          >
            ยกเลิกการแก้ไข
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-400">ร่างจะยังไม่เข้างบการเงิน จนกว่าจะกดผ่านรายการ</p>

      {/* ตัวเลือกจากที่เคยพิมพ์ไว้ในใบสำคัญก่อนๆ — กดลูกศร/คลิกช่องว่างจะเห็นรายการ พิมพ์แล้วจะกรองให้ */}
      <datalist id="je-desc-suggestions">
        {descSuggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="je-memo-suggestions">
        {memoSuggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
