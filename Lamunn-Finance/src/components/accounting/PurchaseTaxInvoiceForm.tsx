"use client";

import { useRef, useState } from "react";
import { useServerRefresh } from "./useServerRefresh";
import { Plus, Trash2 } from "lucide-react";
import PartnerCombobox from "./PartnerCombobox";
import AccountCombobox from "./AccountCombobox";
import { WHT_INCOME_TYPES } from "@/lib/accounting/whtTypes";
import { addVatExclusive, fmtSatang, signedInputToSatang, toSatang, type VatRounding } from "@/lib/accounting/money";
import { withholdingFromPercent } from "@/lib/accounting/withholdingMath";
import PurchaseTaxClaimPeriodSelect from "./PurchaseTaxClaimPeriodSelect";
import { partnerBranchChoices, resolvePartnerBranchChoice } from "@/lib/accounting/partnerBranchSelection";

interface PartnerOption {
  id: string;
  name: string;
  type: "DEBTOR" | "CREDITOR";
  phone: string | null;
  taxId: string | null;
  branchTag: string | null;
  address: string | null;
  branches: Array<{ id: string; branchTag: string; address: string; isDefault: boolean; isActive: boolean }>;
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
  paymentAccounts,
  vatRate,
}: {
  partners: PartnerOption[];
  /** บัญชีค่าใช้จ่าย/สินทรัพย์ ที่จะเดบิต */
  expenseAccounts: AccountOption[];
  /** บัญชีเงินสด/ธนาคารสำหรับใบสำคัญจ่าย */
  paymentAccounts: AccountOption[];
  vatRate: number;
}) {
  const { refresh, refreshing } = useServerRefresh();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const busy = submitting || refreshing;
  const [error, setError] = useState<string | null>(null);
  const nextExpenseLineKey = useRef(2);
  const defaultPaymentAccountId = paymentAccounts.find((account) => account.code === "11111")?.id ?? "";
  const [form, setForm] = useState({
    invoiceNo: "",
    invoiceDate: today(),
    claimPeriod: today().slice(0, 7),
    partnerId: "",
    partnerBranchId: "",
    vendorName: "",
    vendorTaxId: "",
    vendorAddress: "",
    vendorBranchTag: "สำนักงานใหญ่",
    description: "ค่าสินค้า/บริการ",
    baseAmount: "",
    vatRounding: "UP" as VatRounding,
    isClaimable: true,
    note: "",
    expenseLines: [{ key: "expense-1", accountId: "", amount: "" }],
    paymentDate: today(),
    paymentAccountId: defaultPaymentAccountId,
    whtIncomeType: "",
    whtRatePercent: "",
    whtBaseAmount: "",
  });

  /** เลือกคู่ค้าแล้วเติมชื่อ/เลขผู้เสียภาษีให้อัตโนมัติ แต่ยังแก้ทับได้
   * (ชื่อบนใบกำกับบางใบไม่ตรงกับชื่อที่เราบันทึกไว้เป๊ะ ต้องยึดตามใบกำกับ) */
  function pickPartner(id: string) {
    const p = partners.find((x) => x.id === id);
    const branch = resolvePartnerBranchChoice(partners, id);
    setForm((f) => ({
      ...f,
      partnerId: id,
      partnerBranchId: branch.partnerBranchId,
      vendorName: p ? p.name : f.vendorName,
      vendorTaxId: p?.taxId ?? f.vendorTaxId,
      vendorBranchTag: branch.branchTag || f.vendorBranchTag,
      vendorAddress: branch.address || f.vendorAddress,
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/accounting/purchase-tax-invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        // API ยังรับรูปแบบเดิมสำหรับงานนำเข้าเก่า แต่หน้าจอใหม่นี้ยึดยอดก่อนภาษีเป็นต้นทางเสมอ
        amount: form.baseAmount,
        amountIncludesVat: false,
      }),
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
      baseAmount: "",
      note: "",
      whtIncomeType: "",
      whtRatePercent: "",
      whtBaseAmount: "",
      expenseLines: form.expenseLines.map((line) => ({ ...line, amount: "" })),
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
  const enteredBase = signedInputToSatang(form.baseAmount);
  const isCreditNote = enteredBase < 0;
  const { base, vat } = addVatExclusive(enteredBase, vatRate, form.vatRounding);
  const whtEnabled = Boolean(form.whtIncomeType);
  const whtBase = form.whtBaseAmount.trim() ? toSatang(form.whtBaseAmount) : base;
  const wht = withholdingFromPercent(whtBase, form.whtRatePercent);
  const total = base + vat;
  const netPayable = total - wht.amount;
  const partnerBranches = partnerBranchChoices(partners, form.partnerId);
  const allocationTarget = Math.abs(base);
  const activeExpenseLines = form.expenseLines.filter((line) => line.accountId || line.amount.trim());
  const allocationTotal = activeExpenseLines.length === 1 && activeExpenseLines[0].accountId && !activeExpenseLines[0].amount.trim()
    ? allocationTarget
    : activeExpenseLines.reduce((sum, line) => sum + Math.max(0, signedInputToSatang(line.amount)), 0);
  const allocationDifference = allocationTarget - allocationTotal;
  return (
    <form onSubmit={submit} className="w-full rounded-xl border border-gray-200 bg-white p-5">
      <p className="mb-4 text-sm font-semibold text-gray-800">{isCreditNote ? "บันทึกใบลดหนี้" : "บันทึกใบกำกับภาษีซื้อ"}</p>

      {isCreditNote && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          ตรวจพบยอดติดลบ/วงเล็บ — ระบบจะลดฐานภาษีและภาษีซื้อ พร้อมกลับด้านเดบิต/เครดิตให้อัตโนมัติ
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className={label}>
          เลขที่ใบกำกับ (ตามใบของผู้ขาย)
          <input required value={form.invoiceNo} onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })} className={field} />
        </label>
        <label className={label}>
          วันที่บนใบกำกับ
          <input
            type="date"
            required
            value={form.invoiceDate}
            onChange={(e) => {
              const invoiceDate = e.target.value;
              const oldInvoiceMonth = form.invoiceDate.slice(0, 7);
              const newInvoiceMonth = invoiceDate.slice(0, 7);
              const paymentDate = form.paymentDate === form.invoiceDate ? invoiceDate : form.paymentDate;
              setForm({
                ...form,
                invoiceDate,
                paymentDate,
                // ถ้ายังไม่เคยเลื่อนงวด ให้ขยับตามวันที่ใหม่; ถ้าเลือกเองแล้วต้องรักษาเดือนที่ผู้ใช้ตั้งใจเคลม
                claimPeriod: form.claimPeriod === oldInvoiceMonth || form.claimPeriod < newInvoiceMonth ? newInvoiceMonth : form.claimPeriod,
              });
            }}
            className={field}
          />
        </label>
        <label className={label}>
          เคลมในงวดภาษี
          <PurchaseTaxClaimPeriodSelect
            invoiceDate={form.invoiceDate}
            value={form.claimPeriod}
            onChange={(claimPeriod) => setForm({ ...form, claimPeriod })}
            className={field}
          />
          <span className="mt-1 text-xs font-normal text-gray-500">วันที่ในรายงานยังเป็นวันที่จริงบนใบกำกับ</span>
        </label>
        <div className={label}>
          เลือกจากคู่ค้า (ถ้ามี)
          <div className="mt-1">
            <PartnerCombobox partners={partners} value={form.partnerId} onChange={pickPartner} />
          </div>
        </div>
        <label className={label}>
          สำนักงานใหญ่ / สาขาที่
          {partnerBranches.length > 0 ? (
            <select
              value={form.partnerBranchId}
              onChange={(event) => {
                const branch = resolvePartnerBranchChoice(partners, form.partnerId, event.target.value);
                setForm((current) => ({
                  ...current,
                  partnerBranchId: branch.partnerBranchId,
                  vendorBranchTag: branch.branchTag,
                  vendorAddress: branch.address,
                }));
              }}
              className={field}
            >
              {partnerBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.branchTag}</option>
              ))}
            </select>
          ) : (
            <input value={form.vendorBranchTag} onChange={(e) => setForm({ ...form, vendorBranchTag: e.target.value })} className={field} />
          )}
        </label>

        <label className={`${label} sm:col-span-2`}>
          ชื่อผู้ขาย (ตามใบกำกับ)
          <input required value={form.vendorName} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} className={field} />
        </label>
        <label className={label}>
          เลขประจำตัวผู้เสียภาษีผู้ขาย
          <input value={form.vendorTaxId} onChange={(e) => setForm({ ...form, vendorTaxId: e.target.value })} maxLength={13} className={field} />
        </label>
        <label className={`${label} sm:col-span-2`}>
          ที่อยู่ผู้ขายตามสาขา
          <input value={form.vendorAddress} onChange={(e) => setForm({ ...form, vendorAddress: e.target.value })} className={field} />
        </label>
        <label className={label}>
          รายการ
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={field} />
        </label>

        <label className={label}>
          ยอดก่อนภาษี
          <input
            required
            inputMode="decimal"
            value={form.baseAmount}
            onChange={(e) => {
              const baseAmount = e.target.value;
              setForm({
                ...form,
                baseAmount,
                ...(signedInputToSatang(baseAmount) < 0 ? { whtIncomeType: "", whtRatePercent: "", whtBaseAmount: "" } : {}),
              });
            }}
            placeholder="เช่น 1000 หรือ (1000)"
            className={field}
          />
        </label>
        <label className={label}>
          ภาษี
          <input
            readOnly
            value={fmtSatang(vat, { zeroDash: false })}
            className={`${field} bg-gray-50 tabular-nums`}
          />
        </label>
        <label className={label}>
          การปัดเศษภาษี
          <select
            value={form.vatRounding}
            onChange={(e) => setForm({ ...form, vatRounding: e.target.value as VatRounding })}
            className={field}
          >
            <option value="UP">เพิ่ม 0.01 บาท</option>
            <option value="DOWN">ลด 0.01 บาท</option>
          </select>
        </label>
        <label className={label}>
          ยอดรวม
          <input
            readOnly
            value={fmtSatang(total, { zeroDash: false })}
            className={`${field} bg-gray-50 font-medium tabular-nums`}
          />
        </label>
        <label className={`${label} sm:col-span-2 lg:col-span-4`}>
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

      {!isCreditNote && <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50/50 p-3">
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
              <div className={`${label} rounded-lg border border-violet-100 bg-white px-3 py-2 sm:col-span-2`}>
                ที่อยู่ในหนังสือรับรอง 50 ทวิ
                <p className="mt-1 text-sm text-gray-800">{form.vendorAddress || "กรุณากรอกที่อยู่ผู้ขายตามสาขาด้านบน"}</p>
              </div>
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
      </div>}


      <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50/50 p-3">
        <p className="mb-2 text-sm font-medium text-gray-800">ลงบัญชีให้เลย (ไม่บังคับ)</p>
        <p className="mb-3 text-xs text-gray-500">
          แบ่งฐานก่อน VAT ไปยังบัญชีค่าใช้จ่าย/สินทรัพย์ได้หลายบรรทัด แล้วเลือกบัญชีที่ใช้จ่าย ระบบจะสร้างใบสำคัญเป็นร่างให้เอง —
          ไม่ต้องไปคีย์ในสมุดรายวันซ้ำ และรายงานภาษีจะไม่นับยอดสองรอบ
          <br />
          ถ้ามีบัญชีเดบิตเพียงบรรทัดเดียว สามารถเว้นยอดไว้เพื่อใช้ฐานก่อน VAT ทั้งจำนวนได้
          หากไม่เลือกบัญชีค่าใช้จ่าย/สินทรัพย์ ระบบจะบันทึกเฉพาะเอกสารโดยไม่ลงบัญชี
        </p>
        <div className="space-y-2">
          {form.expenseLines.map((line, index) => (
            <div key={line.key} className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
              <div className={label}>
                บัญชีค่าใช้จ่าย/สินทรัพย์ บรรทัดที่ {index + 1} ({isCreditNote ? "เครดิตเพื่อลดยอด" : "เดบิต"})
                <div className="mt-1">
                  <AccountCombobox
                    accounts={expenseAccounts}
                    value={line.accountId}
                    onChange={(accountId) => setForm((current) => ({
                      ...current,
                      expenseLines: current.expenseLines.map((item) => item.key === line.key ? { ...item, accountId } : item),
                    }))}
                  />
                </div>
              </div>
              <label className={label}>
                ยอดก่อน VAT (บาท)
                <input
                  inputMode="decimal"
                  value={line.amount}
                  onChange={(event) => {
                    const amount = event.target.value;
                    setForm((current) => ({
                      ...current,
                      expenseLines: current.expenseLines.map((item) => item.key === line.key ? { ...item, amount } : item),
                    }));
                  }}
                  placeholder={form.expenseLines.length === 1 ? fmtSatang(allocationTarget, { zeroDash: false }) : "0.00"}
                  className={field}
                />
              </label>
              <button
                type="button"
                aria-label={`ลบบรรทัดบัญชีที่ ${index + 1}`}
                disabled={form.expenseLines.length === 1}
                onClick={() => setForm((current) => ({
                  ...current,
                  expenseLines: current.expenseLines.filter((item) => item.key !== line.key),
                }))}
                className="mb-0.5 rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setForm((current) => ({
              ...current,
              expenseLines: [
                ...current.expenseLines,
                { key: `expense-${nextExpenseLineKey.current++}`, accountId: "", amount: "" },
              ],
            }))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-2 text-xs font-medium text-brand-700 hover:bg-brand-50"
          >
            <Plus size={14} /> เพิ่มบรรทัดบัญชี
          </button>

          <div className="grid grid-cols-3 gap-2 rounded-lg bg-white p-2 text-xs">
            <div><span className="block text-gray-500">ฐานก่อน VAT</span><strong>{fmtSatang(allocationTarget, { zeroDash: false })}</strong></div>
            <div><span className="block text-gray-500">แบ่งบัญชีแล้ว</span><strong>{fmtSatang(allocationTotal, { zeroDash: false })}</strong></div>
            <div>
              <span className="block text-gray-500">{allocationDifference >= 0 ? "คงเหลือ" : "เกิน"}</span>
              <strong className={allocationDifference === 0 ? "text-emerald-700" : "text-rose-700"}>
                {fmtSatang(Math.abs(allocationDifference), { zeroDash: false })}
              </strong>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>
              วันที่จ่าย
              <input
                type="date"
                value={form.paymentDate}
                onChange={(event) => setForm({ ...form, paymentDate: event.target.value })}
                className={field}
              />
            </label>
            <div className={label}>
              {isCreditNote ? "บัญชีรับเงินคืน" : "บัญชีที่ใช้จ่าย (สมุดรายวันจ่าย)"}
              <div className="mt-1">
                <AccountCombobox
                  accounts={paymentAccounts}
                  value={form.paymentAccountId}
                  onChange={(id) => setForm({ ...form, paymentAccountId: id })}
                />
              </div>
            </div>
          </div>
          {!isCreditNote && (
            <span className="block text-xs text-gray-500">
              ระบบจะตั้งเจ้าหนี้ 2110 ในใบสำคัญซื้อ แล้วตัดจ่ายด้วยบัญชี 11111 ในใบสำคัญจ่าย
              {whtEnabled ? " พร้อมตั้งภาษีหัก 27124" : ""}
            </span>
          )}
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {busy ? "กำลังบันทึก..." : isCreditNote ? "บันทึกใบลดหนี้" : "บันทึก"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
          ยกเลิก
        </button>
      </div>
    </form>
  );
}
