"use client";

import { useState } from "react";
import { useServerRefresh } from "./useServerRefresh";
import { Plus } from "lucide-react";
import PartnerCombobox from "./PartnerCombobox";
import AccountCombobox from "./AccountCombobox";
import { WHT_INCOME_TYPES, WHT_FORM_LABELS } from "@/lib/accounting/whtTypes";

interface PartnerOption {
  id: string;
  name: string;
  type: "DEBTOR" | "CREDITOR";
  phone: string | null;
  taxId: string | null;
  branchTag: string | null;
  address: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);

/** บันทึกการหักภาษี ณ ที่จ่าย 1 ครั้ง — รวมทั้งเดือนแล้วได้เป็นแบบ ภ.ง.ด.3 / ภ.ง.ด.53
 * ยอดภาษีคำนวณสดให้เห็นก่อนกดบันทึก จะได้ทานกับใบจริงได้ทันที */
interface AccountOption {
  id: string;
  code: string;
  nameTh: string;
}

export default function WhtCertificateForm({
  partners,
  defaultFormType,
  expenseAccounts,
  creditAccounts,
}: {
  partners: PartnerOption[];
  defaultFormType: "PND3" | "PND53";
  expenseAccounts: AccountOption[];
  creditAccounts: AccountOption[];
}) {
  const { refresh, refreshing } = useServerRefresh();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const busy = submitting || refreshing;
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    payDate: today(),
    formType: defaultFormType,
    partnerId: "",
    payeeName: "",
    payeeTaxId: "",
    payeeBranchTag: "สำนักงานใหญ่",
    payeeAddress: "",
    incomeType: WHT_INCOME_TYPES[0].label,
    baseAmount: "",
    whtRate: String(WHT_INCOME_TYPES[0].rate),
    note: "",
    expenseAccountId: "",
    creditAccountId: "",
  });

  const base = Number(form.baseAmount) || 0;
  const rate = Number(form.whtRate) || 0;
  const wht = Math.round(base * rate * 100) / 100;
  const netPay = Math.round((base - wht) * 100) / 100;
  const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function pickPartner(id: string) {
    const p = partners.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      partnerId: id,
      payeeName: p ? p.name : f.payeeName,
      payeeTaxId: p?.taxId ?? f.payeeTaxId,
      payeeBranchTag: p?.branchTag ?? f.payeeBranchTag,
      payeeAddress: p?.address ?? f.payeeAddress,
    }));
  }

  function pickIncomeType(label: string) {
    const t = WHT_INCOME_TYPES.find((x) => x.label === label);
    setForm((f) => ({ ...f, incomeType: label, whtRate: t ? String(t.rate) : f.whtRate }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/accounting/wht", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    setForm({ ...form, payeeName: "", payeeTaxId: "", payeeAddress: "", baseAmount: "", note: "" });
    setOpen(false);
    refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        <Plus size={15} /> บันทึกการหัก ณ ที่จ่าย
      </button>
    );
  }

  const field = "mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900";
  const label = "text-xs text-gray-500";

  return (
    <form onSubmit={submit} className="w-full rounded-xl border border-gray-200 bg-white p-5">
      <p className="mb-4 text-sm font-semibold text-gray-800">บันทึกการหักภาษี ณ ที่จ่าย</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className={label}>
          วันที่จ่ายเงิน
          <input type="date" required value={form.payDate} onChange={(e) => setForm({ ...form, payDate: e.target.value })} className={field} />
        </label>
        <label className={label}>
          แบบที่ต้องยื่น
          <select value={form.formType} onChange={(e) => setForm({ ...form, formType: e.target.value as "PND3" | "PND53" })} className={field}>
            <option value="PND3">{WHT_FORM_LABELS.PND3}</option>
            <option value="PND53">{WHT_FORM_LABELS.PND53}</option>
          </select>
        </label>
        <div className={label}>
          เลือกจากคู่ค้า (ถ้ามี)
          <div className="mt-1">
            <PartnerCombobox partners={partners} value={form.partnerId} onChange={pickPartner} />
          </div>
        </div>
        <label className={label}>
          สำนักงานใหญ่ / สาขาที่
          <input value={form.payeeBranchTag} onChange={(e) => setForm({ ...form, payeeBranchTag: e.target.value })} className={field} />
        </label>

        <label className={`${label} sm:col-span-2`}>
          ชื่อผู้รับเงิน
          <input required value={form.payeeName} onChange={(e) => setForm({ ...form, payeeName: e.target.value })} className={field} />
        </label>
        <label className={label}>
          เลขประจำตัวผู้เสียภาษี
          <input value={form.payeeTaxId} onChange={(e) => setForm({ ...form, payeeTaxId: e.target.value })} maxLength={13} className={field} />
        </label>
        <label className={label}>
          ที่อยู่ผู้ถูกหักภาษี
          <input required={form.formType === "PND3"} value={form.payeeAddress} onChange={(e) => setForm({ ...form, payeeAddress: e.target.value })} className={field} />
          {form.formType === "PND3" && <span className="mt-1 block text-[11px] text-gray-400">จำเป็นสำหรับหนังสือรับรอง 50 ทวิ</span>}
        </label>

        <label className={`${label} sm:col-span-2`}>
          ประเภทเงินได้
          <select value={form.incomeType} onChange={(e) => pickIncomeType(e.target.value)} className={field}>
            {WHT_INCOME_TYPES.map((t) => (
              <option key={t.label} value={t.label}>
                {t.label} — {(t.rate * 100).toFixed(0)}%
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          จำนวนเงินที่จ่าย (ก่อนหัก)
          <input required inputMode="decimal" value={form.baseAmount} onChange={(e) => setForm({ ...form, baseAmount: e.target.value })} className={field} />
        </label>
        <label className={label}>
          อัตราภาษี (0.03 = 3%)
          <input required inputMode="decimal" value={form.whtRate} onChange={(e) => setForm({ ...form, whtRate: e.target.value })} className={field} />
        </label>
      </div>

      <div className="mt-4 grid gap-3 rounded-lg bg-gray-50 p-3 sm:grid-cols-3">
        <div>
          <p className="text-xs text-gray-500">ภาษีที่หักไว้</p>
          <p className="text-lg font-bold tabular-nums text-brand-700">{fmt(wht)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">จ่ายจริงให้ผู้รับเงิน</p>
          <p className="text-lg font-bold tabular-nums text-gray-800">{fmt(netPay)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">อัตราที่ใช้</p>
          <p className="text-lg font-bold tabular-nums text-gray-800">{(rate * 100).toFixed(2)}%</p>
        </div>
      </div>


      <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50/50 p-3">
        <p className="mb-2 text-sm font-medium text-gray-800">ลงบัญชีให้เลย (ไม่บังคับ)</p>
        <p className="mb-3 text-xs text-gray-500">
          เลือกบัญชีให้ครบทั้งสองช่อง ระบบจะสร้างใบสำคัญเป็นร่างให้เอง แล้วผูกกับเอกสารใบนี้ —
          ไม่ต้องไปคีย์ในสมุดรายวันซ้ำ และรายงานภาษีจะไม่นับยอดสองรอบ
          <br />
          ถ้าเว้นว่างไว้ เอกสารจะถูกบันทึกอย่างเดียว ต้องไปคีย์ใบสำคัญเองทีหลัง
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={label}>
            บัญชีค่าใช้จ่าย (เดบิต)
            <div className="mt-1">
              <AccountCombobox accounts={expenseAccounts} value={form.expenseAccountId} onChange={(id) => setForm({ ...form, expenseAccountId: id })} />
            </div>
          </div>
          <div className={label}>
            จ่ายด้วย (เครดิต — ยอดหลังหักภาษี)
            <div className="mt-1">
              <AccountCombobox accounts={creditAccounts} value={form.creditAccountId} onChange={(id) => setForm({ ...form, creditAccountId: id })} />
            </div>
          </div>
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {busy ? "กำลังบันทึก..." : "บันทึก"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
          ยกเลิก
        </button>
      </div>
    </form>
  );
}
