"use client";

import { useRef, useState } from "react";
import { useServerRefresh } from "./useServerRefresh";
import { EllipsisVertical, Plus, Trash2, X } from "lucide-react";
import PartnerCombobox from "./PartnerCombobox";
import AccountCombobox from "./AccountCombobox";
import { WHT_INCOME_TYPES } from "@/lib/accounting/whtTypes";
import { addVatExclusive, fmtSatang, signedInputToSatang, toSatang, type VatRounding } from "@/lib/accounting/money";
import { withholdingFromPercent } from "@/lib/accounting/withholdingMath";
import PurchaseTaxClaimPeriodSelect from "./PurchaseTaxClaimPeriodSelect";
import { partnerBranchChoices, resolvePartnerBranchChoice } from "@/lib/accounting/partnerBranchSelection";
import {
  summarizePurchaseTaxLineItems,
  type PurchaseTaxItemCategory,
  type PurchaseTaxPriceCondition,
} from "@/lib/accounting/purchaseTaxLineItems";

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

interface PurchaseLineFormValue {
  key: string;
  category: PurchaseTaxItemCategory;
  description: string;
  quantity: string;
  unitPrice: string;
  priceCondition: PurchaseTaxPriceCondition;
  vatRatePercent: string;
}

const ITEM_CATEGORIES: Array<{ value: PurchaseTaxItemCategory; label: string }> = [
  { value: "RAW_MATERIAL", label: "วัตถุดิบ" },
  { value: "PACKAGING", label: "บรรจุภัณฑ์" },
  { value: "OTHER", label: "อื่น ๆ" },
];

function emptyPurchaseLine(key: string, category: PurchaseTaxItemCategory, vatRate: number): PurchaseLineFormValue {
  return {
    key,
    category,
    description: "",
    quantity: "1",
    unitPrice: "",
    priceCondition: "VAT",
    vatRatePercent: String(vatRate * 100),
  };
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
  const nextPurchaseLineKey = useRef(2);
  const [priceConditionLineKey, setPriceConditionLineKey] = useState<string | null>(null);
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
    vatRounding: "NEAREST" as VatRounding,
    itemCategory: "RAW_MATERIAL" as PurchaseTaxItemCategory,
    lineItems: [emptyPurchaseLine("purchase-line-1", "RAW_MATERIAL", vatRate)],
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
    const lineSummary = summarizePurchaseTaxLineItems(form.lineItems, vatRate, form.vatRounding);
    if (lineSummary.errors.length > 0) {
      setSubmitting(false);
      setError(lineSummary.errors[0]);
      return;
    }
    const res = await fetch("/api/accounting/purchase-tax-invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        // API ยังรับรูปแบบเดิมสำหรับงานนำเข้าเก่า แต่หน้าจอใหม่นี้ยึดยอดก่อนภาษีเป็นต้นทางเสมอ
        amount: lineSummary.hasItems ? (lineSummary.baseSatang / 100).toFixed(2) : form.baseAmount,
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
      lineItems: [emptyPurchaseLine(`purchase-line-${nextPurchaseLineKey.current++}`, form.itemCategory, vatRate)],
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
  const lineSummary = summarizePurchaseTaxLineItems(form.lineItems, vatRate, form.vatRounding);
  const enteredBase = signedInputToSatang(form.baseAmount);
  const manualAmounts = addVatExclusive(enteredBase, vatRate, form.vatRounding);
  const base = lineSummary.hasItems ? lineSummary.baseSatang : manualAmounts.base;
  const vat = lineSummary.hasItems ? lineSummary.vatSatang : manualAmounts.vat;
  const isCreditNote = base < 0;
  const vatRateLabel = (vatRate * 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
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
  const selectedPriceLine = form.lineItems.find((line) => line.key === priceConditionLineKey) ?? null;
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
            required={!lineSummary.hasItems}
            readOnly={lineSummary.hasItems}
            inputMode="decimal"
            value={lineSummary.hasItems ? fmtSatang(base, { zeroDash: false }) : form.baseAmount}
            onChange={(e) => {
              const baseAmount = e.target.value;
              setForm({
                ...form,
                baseAmount,
                ...(signedInputToSatang(baseAmount) < 0 ? { whtIncomeType: "", whtRatePercent: "", whtBaseAmount: "" } : {}),
              });
            }}
            placeholder="เช่น 1000 หรือ (1000)"
            className={`${field} ${lineSummary.hasItems ? "bg-gray-50" : ""}`}
          />
          {lineSummary.hasItems
            ? <span className="mt-1 block text-[11px] text-emerald-700">คำนวณจากรายละเอียดสินค้าด้านล่าง</span>
            : <span className="mt-1 block text-[11px] text-gray-500">กรอกยอดนี้ แล้วระบบคำนวณภาษี {vatRateLabel}% ให้อัตโนมัติ</span>}
        </label>
        <label className={label}>
          ภาษี {vatRateLabel}%
          <input
            readOnly
            value={fmtSatang(vat, { zeroDash: false })}
            aria-live="polite"
            className={`${field} bg-gray-50 tabular-nums`}
          />
        </label>
        <label className={label}>
          ปัดทศนิยมของภาษี {vatRateLabel}%
          <select
            value={form.vatRounding}
            onChange={(e) => setForm({ ...form, vatRounding: e.target.value as VatRounding })}
            className={field}
          >
            <option value="NEAREST">ปกติ</option>
            <option value="UP">ปัดขึ้น 0.01 บาท</option>
            <option value="DOWN">ปัดลง 0.01 บาท</option>
          </select>
        </label>
        <label className={label}>
          ยอดรวม
          <input
            readOnly
            value={fmtSatang(total, { zeroDash: false })}
            aria-live="polite"
            className={`${field} bg-gray-50 font-medium tabular-nums`}
          />
        </label>
        <label className={`${label} sm:col-span-2 lg:col-span-4`}>
          หมายเหตุ
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={field} />
        </label>
      </div>

      <section className="mt-5 rounded-xl border border-sky-200 bg-sky-50/40 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">วัตถุดิบ / บรรจุภัณฑ์ / อื่น ๆ</h3>
            <p className="mt-0.5 text-xs text-gray-500">กรอกรายละเอียดสินค้า/บริการแยกบรรทัดเพื่อให้ระบบรวมยอดและภาษีให้อัตโนมัติ</p>
          </div>
          <label className="text-xs text-gray-500">
            หมวดรายการ
            <select
              value={form.itemCategory}
              onChange={(event) => {
                const itemCategory = event.target.value as PurchaseTaxItemCategory;
                setForm((current) => ({
                  ...current,
                  itemCategory,
                  lineItems: current.lineItems.map((line) => ({ ...line, category: itemCategory })),
                }));
              }}
              className="ml-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
            >
              {ITEM_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[36px_minmax(220px,1fr)_110px_150px_150px_44px] gap-2 px-1 text-xs font-medium text-gray-500">
              <span>ลำดับ</span><span>รายการ</span><span>จำนวน</span><span>ราคาต่อหน่วย</span><span className="text-right">ราคารวม</span><span />
            </div>
            <div className="mt-2 space-y-2">
              {form.lineItems.map((line, index) => {
                const preview = summarizePurchaseTaxLineItems(
                  [{ ...line, description: line.description || "รายการ" }],
                  vatRate,
                  "NEAREST"
                );
                const calculatedLine = preview.items[0];
                const conditionText = line.priceCondition === "FREE"
                  ? "ของแถม"
                  : line.priceCondition === "VAT_EXEMPT"
                    ? "ยกเว้น VAT"
                    : `VAT ${line.vatRatePercent || vatRate * 100}%`;
                return (
                  <div key={line.key} className="rounded-lg border border-gray-200 bg-white p-2">
                    <div className="grid grid-cols-[36px_minmax(220px,1fr)_110px_150px_150px_44px] items-center gap-2">
                      <span className="text-center text-sm text-gray-500">{index + 1}</span>
                      <input
                        value={line.description}
                        onChange={(event) => setForm((current) => ({
                          ...current,
                          lineItems: current.lineItems.map((item) => item.key === line.key ? { ...item, description: event.target.value } : item),
                        }))}
                        placeholder="ชื่อสินค้า/บริการ"
                        className={field}
                      />
                      <input
                        type="number"
                        step="0.0001"
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={(event) => setForm((current) => ({
                          ...current,
                          lineItems: current.lineItems.map((item) => item.key === line.key ? { ...item, quantity: event.target.value } : item),
                        }))}
                        className={field}
                      />
                      <input
                        inputMode="decimal"
                        value={line.unitPrice}
                        disabled={line.priceCondition === "FREE"}
                        onChange={(event) => setForm((current) => ({
                          ...current,
                          lineItems: current.lineItems.map((item) => item.key === line.key ? { ...item, unitPrice: event.target.value } : item),
                        }))}
                        placeholder="0.0000"
                        aria-label={`ราคาต่อหน่วยบรรทัดที่ ${index + 1} (ทศนิยมไม่เกิน 4 ตำแหน่ง)`}
                        className={`${field} disabled:bg-gray-100`}
                      />
                      <div className="text-right">
                        <span className="block text-sm font-medium tabular-nums text-gray-800">
                          {fmtSatang(calculatedLine?.baseSatang ?? 0, { zeroDash: false })}
                        </span>
                        <span className="text-[11px] text-gray-500">{conditionText}</span>
                      </div>
                      <button
                        type="button"
                        aria-label={`เงื่อนไขราคาบรรทัดที่ ${index + 1}`}
                        onClick={() => setPriceConditionLineKey(line.key)}
                        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                      >
                        <EllipsisVertical size={18} />
                      </button>
                    </div>
                    {form.lineItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setForm((current) => ({ ...current, lineItems: current.lineItems.filter((item) => item.key !== line.key) }))}
                        className="mt-1 inline-flex items-center gap-1 text-[11px] text-rose-600 hover:text-rose-700"
                      >
                        <Trash2 size={12} /> ลบบรรทัด
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setForm((current) => ({
            ...current,
            lineItems: [
              ...current.lineItems,
              emptyPurchaseLine(`purchase-line-${nextPurchaseLineKey.current++}`, current.itemCategory, vatRate),
            ],
          }))}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50"
        >
          <Plus size={15} /> เพิ่มบรรทัด
        </button>

        <div className="mt-4 ml-auto grid max-w-sm grid-cols-[1fr_auto] gap-x-8 gap-y-2 border-t border-sky-200 pt-4 text-sm">
          <span className="font-medium text-gray-700">ยอดรวม</span><strong className="text-right tabular-nums">{fmtSatang(base, { zeroDash: false })}</strong>
          <span className="font-medium text-gray-700">ภาษี 7%</span><strong className="text-right tabular-nums">{fmtSatang(vat, { zeroDash: false })}</strong>
          <span className="font-semibold text-gray-900">ยอดเงินสุทธิ</span><strong className="text-right text-base tabular-nums text-gray-900">{fmtSatang(total, { zeroDash: false })}</strong>
        </div>
      </section>

      {selectedPriceLine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="เงื่อนไขราคา">
          <div className="w-full max-w-xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-900">เงื่อนไขราคา</h3>
              <button type="button" onClick={() => setPriceConditionLineKey(null)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="ปิด">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-3 p-5">
              {([
                ["FREE", "สินค้านี้เป็นของแถม"],
                ["VAT_EXEMPT", "ได้รับยกเว้นภาษีมูลค่าเพิ่ม"],
                ["VAT", "มีภาษีมูลค่าเพิ่มหรือกำหนดเอง"],
              ] as Array<[PurchaseTaxPriceCondition, string]>).map(([value, text]) => (
                <label key={value} className="flex items-center gap-3 text-sm text-gray-800">
                  <input
                    type="radio"
                    name={`price-condition-${selectedPriceLine.key}`}
                    checked={selectedPriceLine.priceCondition === value}
                    onChange={() => setForm((current) => ({
                      ...current,
                      lineItems: current.lineItems.map((item) => item.key === selectedPriceLine.key ? { ...item, priceCondition: value } : item),
                    }))}
                  />
                  {text}
                </label>
              ))}
              {selectedPriceLine.priceCondition === "VAT" && (
                <label className="ml-7 block max-w-xs text-xs text-gray-500">
                  อัตราภาษีมูลค่าเพิ่ม
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      inputMode="decimal"
                      value={selectedPriceLine.vatRatePercent}
                      onChange={(event) => setForm((current) => ({
                        ...current,
                        lineItems: current.lineItems.map((item) => item.key === selectedPriceLine.key ? { ...item, vatRatePercent: event.target.value } : item),
                      }))}
                      className={field}
                    />
                    <span className="text-sm text-gray-700">%</span>
                  </div>
                </label>
              )}
            </div>
            <div className="flex justify-end border-t border-gray-200 px-5 py-4">
              <button type="button" onClick={() => setPriceConditionLineKey(null)} className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700">บันทึก</button>
            </div>
          </div>
        </div>
      )}

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
