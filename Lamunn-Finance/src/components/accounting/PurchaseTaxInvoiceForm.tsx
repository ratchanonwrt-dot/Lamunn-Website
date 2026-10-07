"use client";

import { useState } from "react";
import { useServerRefresh } from "./useServerRefresh";
import { Plus } from "lucide-react";
import PartnerCombobox from "./PartnerCombobox";
import AccountCombobox from "./AccountCombobox";
import { WHT_INCOME_TYPES } from "@/lib/accounting/whtTypes";
import { addVatExclusive, fmtSatang, splitVatInclusive, toSatang } from "@/lib/accounting/money";
import { withholdingFromPercent } from "@/lib/accounting/withholdingMath";

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

/** บันทึกใบกำกับภาษีซื้อที่ผู้ขายออกให้เรา — ป้อนข้อมูลให้รายงานภาษีซื้อและ ภ.พ.30 */
interface AccountOption {
  id: string;
  code: string;
  nameTh: string;
}

export default function PurchaseTaxInvoiceForm({
  partners,
  expenseAccounts,
  creditAccounts,
  vatRate,
}: {
  partners: PartnerOption[];
  /** บัญชีค่าใช้จ่าย/สินทรัพย์ ที่จะเดบิต */
  expenseAccounts: AccountOption[];
  /** บัญชีเงินสด/ธนาคาร/เจ้าหนี้ ที่จะเครดิต */
  creditAccounts: AccountOption[];
  vatRate: number;
}) {
  const { refresh, refreshing } = useServerRefresh();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const busy = submitting || refreshing;
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    invoiceNo: "",
    invoiceDate: today(),
    partnerId: "",
    vendorName: "",
    vendorTaxId: "",
    vendorAddress: "",
    vendorBranchTag: "สำนักงานใหญ่",
    description: "ค่าสินค้า/บริการ",
    amount: "",
    amountIncludesVat: true,
    isClaimable: true,
    note: "",
    expenseAccountId: "",
    creditAccountId: "",
    whtIncomeType: "",
    whtRatePercent: "",
    whtBaseAmount: "",
  });

  /** เลือกคู่ค้าแล้วเติมชื่อ/เลขผู้เสียภาษีให้อัตโนมัติ แต่ยังแก้ทับได้
   * (ชื่อบนใบกำกับบางใบไม่ตรงกับชื่อที่เราบันทึกไว้เป๊ะ ต้องยึดตามใบกำกับ) */
  function pickPartner(id: string) {
    const p = partners.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      partnerId: id,
      vendorName: p ? p.name : f.vendorName,
      vendorTaxId: p?.taxId ?? f.vendorTaxId,
      vendorBranchTag: p?.branchTag ?? f.vendorBranchTag,
      vendorAddress: p?.address ?? f.vendorAddress,
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/accounting/purchase-tax-invoices", {
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
    setForm({
      ...form,
      invoiceNo: "",
      amount: "",
      note: "",
      whtIncomeType: "",
      whtRatePercent: "",
      whtBaseAmount: "",
    });
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
        <Plus size={15} /> บันทึกใบกำกับภาษีซื้อ
      </button>
    );
  }

  const field = "mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900";
  const label = "text-xs text-gray-500";
  const entered = toSatang(form.amount);
  const { base, vat } = form.amountIncludesVat
    ? splitVatInclusive(entered, vatRate)
    : addVatExclusive(entered, vatRate);
  const whtEnabled = Boolean(form.whtIncomeType);
  const whtBase = form.whtBaseAmount.trim() ? toSatang(form.whtBaseAmount) : base;
  const wht = withholdingFromPercent(whtBase, form.whtRatePercent);
  const total = base + vat;
  const netPayable = total - wht.amount;

  return (
    <form onSubmit={submit} className="w-full rounded-xl border border-gray-200 bg-white p-5">
      <p className="mb-4 text-sm font-semibold text-gray-800">บันทึกใบกำกับภาษีซื้อ</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className={label}>
          เลขที่ใบกำกับ (ตามใบของผู้ขาย)
          <input required value={form.invoiceNo} onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })} className={field} />
        </label>
        <label className={label}>
          วันที่บนใบกำกับ
          <input type="date" required value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} className={field} />
        </label>
        <div className={label}>
          เลือกจากคู่ค้า (ถ้ามี)
          <div className="mt-1">
            <PartnerCombobox partners={partners} value={form.partnerId} onChange={pickPartner} />
          </div>
        </div>
        <label className={label}>
          สำนักงานใหญ่ / สาขาที่
          <input value={form.vendorBranchTag} onChange={(e) => setForm({ ...form, vendorBranchTag: e.target.value })} className={field} />
        </label>

        <label className={`${label} sm:col-span-2`}>
          ชื่อผู้ขาย (ตามใบกำกับ)
          <input required value={form.vendorName} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} className={field} />
        </label>
        <label className={label}>
          เลขประจำตัวผู้เสียภาษีผู้ขาย
          <input value={form.vendorTaxId} onChange={(e) => setForm({ ...form, vendorTaxId: e.target.value })} maxLength={13} className={field} />
        </label>
        <label className={label}>
          รายการ
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={field} />
        </label>

        <label className={label}>
          ยอดเงิน
          <input required inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={field} />
        </label>
        <label className={label}>
          ยอดที่กรอก
          <select
            value={form.amountIncludesVat ? "inc" : "exc"}
            onChange={(e) => setForm({ ...form, amountIncludesVat: e.target.value === "inc" })}
            className={field}
          >
            <option value="inc">รวม VAT แล้ว</option>
            <option value="exc">ยังไม่รวม VAT</option>
          </select>
        </label>
        <label className={`${label} sm:col-span-2`}>
          หมายเหตุ
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={field} />
        </label>
      </div>

      <label className="mt-4 flex items-start gap-2.5 rounded-lg bg-gray-50 p-3">
        <input
          type="checkbox"
          checked={form.isClaimable}
          onChange={(e) => setForm({ ...form, isClaimable: e.target.checked })}
          className="mt-0.5 h-4 w-4 rounded border-gray-300"
        />
        <span className="text-sm text-gray-700">
          ภาษีซื้อใบนี้ขอเครดิตได้
          <span className="mt-0.5 block text-xs text-gray-500">
            ติ๊กไว้เป็นปกติ · เอาติ๊กออกถ้าเป็นภาษีซื้อต้องห้าม (เช่น ค่ารับรอง) — ใบยังอยู่ในรายงานภาษีซื้อ
            แต่จะไม่ถูกนำไปหักใน ภ.พ.30
          </span>
        </span>
      </label>

      <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50/50 p-3">
        <p className="mb-1 text-sm font-medium text-gray-800">หักภาษี ณ ที่จ่าย (ถ้ามี)</p>
        <p className="mb-3 text-xs text-gray-500">
          เมื่อเลือกประเภท ระบบจะสร้างรายการ ภ.ง.ด.53 และหนังสือรับรอง 50 ทวิให้อัตโนมัติ โดยไม่บันทึกรายได้หรือค่าใช้จ่ายซ้ำ
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={`${label} sm:col-span-2`}>
            ประเภทเงินได้
            <select
              value={form.whtIncomeType}
              onChange={(e) => {
                const selected = WHT_INCOME_TYPES.find((item) => item.label === e.target.value);
                setForm({
                  ...form,
                  whtIncomeType: e.target.value,
                  whtRatePercent: selected ? String(selected.rate * 100) : "",
                });
              }}
              className={field}
            >
              <option value="">ไม่หักภาษี ณ ที่จ่าย</option>
              {WHT_INCOME_TYPES.filter((item) => item.common !== "PND3").map((item) => (
                <option key={item.label} value={item.label}>
                  {item.label} — {(item.rate * 100).toLocaleString("th-TH")}%
                </option>
              ))}
            </select>
          </label>
          {whtEnabled && (
            <>
              <label className={label}>
                ฐานที่ใช้หัก (บาท)
                <input
                  inputMode="decimal"
                  value={form.whtBaseAmount}
                  onChange={(e) => setForm({ ...form, whtBaseAmount: e.target.value })}
                  placeholder={fmtSatang(base, { zeroDash: false })}
                  className={field}
                />
              </label>
              <label className={label}>
                อัตราหัก (%)
                <input
                  required
                  inputMode="decimal"
                  value={form.whtRatePercent}
                  onChange={(e) => setForm({ ...form, whtRatePercent: e.target.value })}
                  className={field}
                />
              </label>
              <label className={`${label} sm:col-span-2`}>
                ที่อยู่ผู้ถูกหักภาษี (แสดงในหนังสือรับรอง)
                <input
                  required
                  value={form.vendorAddress}
                  onChange={(e) => setForm({ ...form, vendorAddress: e.target.value })}
                  className={field}
                />
              </label>
              <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:grid-cols-4">
                {[
                  ["ฐานก่อน VAT", base],
                  ["VAT", vat],
                  ["ภาษีหัก", wht.amount],
                  ["จ่ายสุทธิ", netPayable],
                ].map(([title, amount]) => (
                  <div key={String(title)} className="rounded-lg border border-violet-100 bg-white px-3 py-2">
                    <span className="block text-[11px] text-gray-500">{title}</span>
                    <span className="font-semibold tabular-nums text-gray-800">{fmtSatang(Number(amount), { zeroDash: false })}</span>
                  </div>
                ))}
              </div>
            </>
          )}
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
            บัญชีค่าใช้จ่าย/สินทรัพย์ (เดบิต)
            <div className="mt-1">
              <AccountCombobox accounts={expenseAccounts} value={form.expenseAccountId} onChange={(id) => setForm({ ...form, expenseAccountId: id })} />
            </div>
          </div>
          <div className={label}>
            จ่ายด้วย / เจ้าหนี้ (เครดิต)
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
