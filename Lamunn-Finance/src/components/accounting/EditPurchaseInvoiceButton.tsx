"use client";

import { useRef, useState } from "react";
import { EllipsisVertical, Plus, Trash2, X } from "lucide-react";
import { useServerRefresh } from "./useServerRefresh";
import { addVatExclusive, fmtSatang, signedInputToSatang, toSatang, type VatRounding } from "@/lib/accounting/money";
import PurchaseTaxClaimPeriodSelect from "./PurchaseTaxClaimPeriodSelect";
import AccountCombobox from "./AccountCombobox";
import AccountingDateInput from "./AccountingDateInput";
import PartnerCombobox from "./PartnerCombobox";
import { WHT_INCOME_TYPES } from "@/lib/accounting/whtTypes";
import { withholdingFromPercent } from "@/lib/accounting/withholdingMath";
import { lineTotalInputFromSnapshot, satangToPlainInput, summarizePurchaseTaxLineItems, totalConditionFromSnapshot, unitPriceDecimalFromSnapshot, type PurchaseTaxItemCategory, type PurchaseTaxPriceCondition, type PurchaseTaxTotalCondition } from "@/lib/accounting/purchaseTaxLineItems";

interface PurchaseLineFormValue {
  key: string;
  category: PurchaseTaxItemCategory;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string | null;
  priceCondition: PurchaseTaxPriceCondition;
  totalCondition: PurchaseTaxTotalCondition;
  vatRatePercent: string;
}
interface PartnerBranch { id: string; branchTag: string; address: string }
interface PartnerOption {
  id: string; name: string; type: "DEBTOR" | "CREDITOR"; phone: string | null; taxId: string | null;
  branchTag: string | null; address: string | null;
  branches: Array<PartnerBranch & { isDefault: boolean; isActive: boolean }>;
}
interface InvoiceData {
  invoiceNo: string;
  invoiceDate: string;
  claimPeriod: string;
  partnerId: string | null;
  partner: { id: string; name: string; branches: PartnerBranch[] } | null;
  vendorName: string;
  vendorTaxId: string | null;
  vendorAddress: string;
  vendorBranchTag: string | null;
  description: string;
  note: string | null;
  isClaimable: boolean;
  baseAmount: number;
  vatAmount: number;
  totalAmount: number;
  lineItems: unknown;
  whtCertificate: { incomeType: string; baseAmount: string | number; whtRate: number; whtAmount: string | number } | null;
}
interface LinkedEntry {
  id: string;
  entryNo: string;
  status: "DRAFT" | "POSTED" | "VOID";
  date: string;
  journalType: string;
  description: string;
  lines: Array<{ id: string; debit: number; credit: number; memo: string | null; account: { code: string; nameTh: string } }>;
}
interface AccountOption { id: string; code: string; nameTh: string }
interface ExpenseLineValue { key: string; accountId: string; amount: string }

const ITEM_CATEGORIES: Array<{ value: PurchaseTaxItemCategory; label: string }> = [
  { value: "RAW_MATERIAL", label: "วัตถุดิบ" },
  { value: "PACKAGING", label: "บรรจุภัณฑ์" },
  { value: "OTHER", label: "อื่น ๆ" },
];
function emptyLine(key: string, vatRate: number): PurchaseLineFormValue {
  return { key, category: "RAW_MATERIAL", description: "", quantity: "1", unitPrice: "", lineTotal: null, priceCondition: "VAT", totalCondition: "VAT_EXCLUDED", vatRatePercent: String(vatRate * 100) };
}
function lineItemsFromApi(value: unknown, vatRate: number): PurchaseLineFormValue[] {
  if (!Array.isArray(value) || value.length === 0) return [emptyLine("edit-line-1", vatRate)];
  return value.map((raw, index) => {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const category = ITEM_CATEGORIES.some((choice) => choice.value === item.category) ? item.category as PurchaseTaxItemCategory : "OTHER";
    const condition = ["VAT", "VAT_EXEMPT", "FREE"].includes(String(item.priceCondition)) ? item.priceCondition as PurchaseTaxPriceCondition : "VAT";
    return {
      key: `edit-line-${index + 1}`,
      category,
      description: String(item.description ?? ""),
      quantity: String(item.quantity ?? "1"),
      unitPrice: unitPriceDecimalFromSnapshot(item),
      lineTotal: lineTotalInputFromSnapshot(item),
      priceCondition: condition,
      totalCondition: totalConditionFromSnapshot(item),
      vatRatePercent: String(item.vatRatePercent ?? vatRate * 100),
    };
  });
}

/** ใช้โครงฟอร์มเดียวกับตอนเพิ่มใบกำกับ เพื่อไม่ให้รายละเอียดสินค้าหายจากสายตาตอนแก้ไข */
export default function EditPurchaseInvoiceButton({ id, vatRate = 0.07 }: { id: string; vatRate?: number }) {
  const { refresh, refreshing } = useServerRefresh();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entry, setEntry] = useState<LinkedEntry | null>(null);
  const [paymentEntry, setPaymentEntry] = useState<LinkedEntry | null>(null);
  const [form, setForm] = useState<InvoiceData | null>(null);
  const [baseAmount, setBaseAmount] = useState("");
  const [vatRounding, setVatRounding] = useState<VatRounding>("NEAREST");
  const [lineItems, setLineItems] = useState<PurchaseLineFormValue[]>([]);
  const [priceConditionLineKey, setPriceConditionLineKey] = useState<string | null>(null);
  const [totalConditionOpen, setTotalConditionOpen] = useState(false);
  const nextLineKey = useRef(20);
  const nextExpenseLineKey = useRef(20);
  const [expenseAccounts, setExpenseAccounts] = useState<AccountOption[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<AccountOption[]>([]);
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [expenseLines, setExpenseLines] = useState<ExpenseLineValue[]>([{ key: "edit-expense-1", accountId: "", amount: "" }]);
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [whtIncomeType, setWhtIncomeType] = useState("");
  const [whtRatePercent, setWhtRatePercent] = useState("");
  const [whtBaseAmount, setWhtBaseAmount] = useState("");

  async function openDialog() {
    setOpen(true); setLoading(true); setError(null);
    const res = await fetch(`/api/accounting/purchase-tax-invoices/${id}`);
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(data.error ?? "โหลดข้อมูลไม่สำเร็จ");
    const restoredLines = lineItemsFromApi(data.invoice.lineItems, vatRate);
    const nearest = summarizePurchaseTaxLineItems(restoredLines, vatRate, "NEAREST");
    const storedVatSatang = Math.round(Number(data.invoice.vatAmount) * 100);
    const restoredRounding: VatRounding = nearest.hasItems && storedVatSatang === nearest.vatSatang + 1
      ? "UP"
      : nearest.hasItems && storedVatSatang === nearest.vatSatang - 1
        ? "DOWN"
        : "NEAREST";
    setForm(data.invoice); setEntry(data.entry); setPaymentEntry(data.paymentEntry ?? null);
    setBaseAmount(String(data.invoice.baseAmount)); setVatRounding(restoredRounding);
    setLineItems(restoredLines);
    setExpenseAccounts(data.formOptions?.expenseAccounts ?? []);
    setPaymentAccounts(data.formOptions?.paymentAccounts ?? []);
    setPartners(data.formOptions?.partners ?? []);
    setExpenseLines(data.accounting?.expenseLines?.length
      ? data.accounting.expenseLines.map((line: { accountId: string; amount: number }, index: number) => ({ key: `edit-expense-${index + 1}`, accountId: line.accountId, amount: String(line.amount) }))
      : [{ key: "edit-expense-1", accountId: "", amount: "" }]);
    setPaymentDate(data.accounting?.paymentDate ?? data.invoice.invoiceDate);
    setPaymentAccountId(data.accounting?.paymentAccountId ?? "");
    setWhtIncomeType(data.invoice.whtCertificate?.incomeType ?? "");
    setWhtRatePercent(data.invoice.whtCertificate ? String(Number(data.invoice.whtCertificate.whtRate) * 100) : "");
    setWhtBaseAmount(data.invoice.whtCertificate ? String(Number(data.invoice.whtCertificate.baseAmount)) : "");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    const calculated = summarizePurchaseTaxLineItems(lineItems, vatRate, vatRounding);
    if (calculated.errors.length > 0) return setError(calculated.errors[0]);
    setSubmitting(true); setError(null);
    const res = await fetch(`/api/accounting/purchase-tax-invoices/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceNo: form.invoiceNo, invoiceDate: form.invoiceDate, claimPeriod: form.claimPeriod,
        partnerId: form.partnerId, vendorName: form.vendorName, vendorTaxId: form.vendorTaxId ?? "",
        vendorAddress: form.vendorAddress, vendorBranchTag: form.vendorBranchTag ?? "", description: form.description,
        note: form.note ?? "", isClaimable: form.isClaimable, amount: baseAmount, amountIncludesVat: false,
        vatRounding, lineItems,
        ...(!amountLocked ? { expenseLines, paymentDate, paymentAccountId, whtIncomeType, whtRatePercent, whtBaseAmount } : {}),
      }),
    });
    const data = await res.json().catch(() => ({})); setSubmitting(false);
    if (!res.ok) return setError(data.error ?? "บันทึกไม่สำเร็จ");
    setOpen(false); refresh();
  }

  const amountLocked = entry?.status === "POSTED" || paymentEntry?.status === "POSTED";
  const summary = summarizePurchaseTaxLineItems(lineItems, vatRate, vatRounding);
  const manual = addVatExclusive(signedInputToSatang(baseAmount), vatRate, vatRounding);
  const base = summary.hasItems ? summary.baseSatang : manual.base;
  const vat = summary.hasItems ? summary.vatSatang : manual.vat;
  const total = base + vat;
  const wht = withholdingFromPercent(whtBaseAmount.trim() ? toSatang(whtBaseAmount) : base, whtRatePercent);
  const activeExpenseLines = expenseLines.filter((line) => line.accountId || line.amount.trim());
  const allocationTotal = activeExpenseLines.length === 1 && activeExpenseLines[0].accountId && !activeExpenseLines[0].amount.trim()
    ? Math.abs(base)
    : activeExpenseLines.reduce((sum, line) => sum + Math.max(0, signedInputToSatang(line.amount)), 0);
  const allocationDifference = Math.abs(base) - allocationTotal;
  const field = "mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-400";
  const label = "text-xs text-gray-500";
  const selectedPriceLine = lineItems.find((line) => line.key === priceConditionLineKey) ?? null;
  const invoiceTotalCondition = lineItems.find((line) => line.priceCondition === "VAT")?.totalCondition ?? "VAT_EXCLUDED";
  const branches = partners.find((partner) => partner.id === form?.partnerId)?.branches ?? form?.partner?.branches ?? [];

  return <>
    <button type="button" disabled={refreshing} onClick={openDialog} className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50">{refreshing ? "กำลังอัปเดต..." : "แก้ไข"}</button>
    {open && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-4 print:hidden">
      <form onSubmit={save} className="my-4 w-full max-w-6xl rounded-xl bg-white p-5 text-left shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-gray-800">แก้ไขใบกำกับภาษีซื้อ</p><p className="mt-1 text-xs text-gray-500">แสดงข้อมูลชุดเดียวกับตอนเพิ่มใบกำกับ และคำนวณยอดใหม่ให้เห็นก่อนบันทึก</p></div><button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="ปิด"><X size={20} /></button></div>
        {loading || !form ? <p className="py-10 text-center text-sm text-gray-400">{error ?? "กำลังโหลด..."}</p> : <>
          {amountLocked && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">ใบสำคัญที่เชื่อมโยงผ่านรายการแล้ว จึงล็อกวันที่และข้อมูลที่มีผลต่อยอดบัญชี หากต้องการแก้ยอดให้ยกเลิกผ่านรายการก่อน</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className={label}>เลขที่ใบกำกับ (ตามใบของผู้ขาย)<input autoFocus required value={form.invoiceNo} onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })} className={field} /></label>
            <label className={label}>วันที่บนใบกำกับ<AccountingDateInput required disabled={amountLocked} value={form.invoiceDate} onChange={(invoiceDate) => setForm({ ...form, invoiceDate, claimPeriod: form.claimPeriod < invoiceDate.slice(0, 7) ? invoiceDate.slice(0, 7) : form.claimPeriod })} className={field} /></label>
            <label className={label}>เคลมในงวดภาษี<PurchaseTaxClaimPeriodSelect invoiceDate={form.invoiceDate} value={form.claimPeriod} onChange={(claimPeriod) => setForm({ ...form, claimPeriod })} className={field} /><span className="mt-1 block text-[11px]">วันที่ในรายงานยังเป็นวันที่จริงบนใบกำกับ</span></label>
            <div className={label}>เลือกจากคู่ค้า (ถ้ามี)<div className="mt-1"><PartnerCombobox partners={partners} value={form.partnerId ?? ""} onChange={(partnerId) => { const partner = partners.find((item) => item.id === partnerId); const branch = partner?.branches.find((item) => item.isDefault) ?? partner?.branches[0]; setForm({ ...form, partnerId, vendorName: partner?.name ?? form.vendorName, vendorTaxId: partner?.taxId ?? form.vendorTaxId, vendorBranchTag: branch?.branchTag ?? partner?.branchTag ?? form.vendorBranchTag, vendorAddress: branch?.address ?? partner?.address ?? form.vendorAddress }); }} /></div></div>
            <label className={label}>สำนักงานใหญ่ / สาขาที่{branches.length > 0 ? <select value={branches.find((branch) => branch.branchTag === form.vendorBranchTag)?.id ?? ""} onChange={(e) => { const branch = branches.find((item) => item.id === e.target.value); if (branch) setForm({ ...form, vendorBranchTag: branch.branchTag, vendorAddress: branch.address }); }} className={field}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.branchTag}</option>)}</select> : <input value={form.vendorBranchTag ?? ""} onChange={(e) => setForm({ ...form, vendorBranchTag: e.target.value })} className={field} />}</label>
            <label className={`${label} sm:col-span-2`}>ชื่อผู้ขาย (ตามใบกำกับ)<input required value={form.vendorName} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} className={field} /></label>
            <label className={label}>เลขประจำตัวผู้เสียภาษีผู้ขาย<input value={form.vendorTaxId ?? ""} onChange={(e) => setForm({ ...form, vendorTaxId: e.target.value })} maxLength={13} className={field} /></label>
            <label className={`${label} sm:col-span-2`}>ที่อยู่ผู้ขายตามสาขา<input value={form.vendorAddress} onChange={(e) => setForm({ ...form, vendorAddress: e.target.value })} className={field} /></label>
            <label className={label}>รายการ<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={field} /></label>
            <label className={label}>ยอดก่อนภาษี<input inputMode="decimal" disabled={amountLocked || summary.hasItems} value={summary.hasItems ? fmtSatang(base, { zeroDash: false }) : baseAmount} onChange={(e) => setBaseAmount(e.target.value)} className={field} /></label>
            <label className={label}>ภาษี 7%<input readOnly value={fmtSatang(vat, { zeroDash: false })} className={`${field} bg-gray-50 tabular-nums`} /></label>
            <label className={label}>ปัดทศนิยมของภาษี 7%<select disabled={amountLocked} value={vatRounding} onChange={(e) => setVatRounding(e.target.value as VatRounding)} className={field}><option value="NEAREST">ปกติ</option><option value="UP">ปัดขึ้น 0.01 บาท</option><option value="DOWN">ปัดลง 0.01 บาท</option></select></label>
            <label className={label}>ยอดรวม<input readOnly value={fmtSatang(total, { zeroDash: false })} className={`${field} bg-gray-50 font-medium tabular-nums`} /></label>
            <label className={`${label} sm:col-span-2 lg:col-span-4`}>หมายเหตุ<input value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} className={field} /></label>
          </div>
          <section className="mt-5 rounded-xl border border-sky-200 bg-sky-50/40 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-sm font-semibold text-gray-800">วัตถุดิบ / บรรจุภัณฑ์ / อื่น ๆ</h3><p className="mt-0.5 text-xs text-gray-500">รายละเอียดเดิมถูกโหลดกลับมาให้แก้ไขเหมือนตอนเพิ่มใบกำกับ</p></div><label className="text-xs text-gray-500">หมวดรายการ<select disabled={amountLocked} value={lineItems[0]?.category ?? "RAW_MATERIAL"} onChange={(e) => setLineItems((items) => items.map((item) => ({ ...item, category: e.target.value as PurchaseTaxItemCategory })))} className="ml-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50">{ITEM_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label></div>
            <div className="mt-4 overflow-x-auto"><div className="min-w-[760px]"><div className="grid grid-cols-[36px_minmax(220px,1fr)_110px_150px_150px_44px] gap-2 px-1 text-xs font-medium text-gray-500"><span>ลำดับ</span><span>รายการ</span><span>จำนวน</span><span>ราคาต่อหน่วย</span><span className="text-right">ราคารวม</span><span /></div><div className="mt-2 space-y-2">{lineItems.map((line, index) => {
              const preview = summarizePurchaseTaxLineItems([{ ...line, description: line.description || "รายการ" }], vatRate, "NEAREST"); const calculated = preview.items[0];
              const condition = line.priceCondition === "FREE" ? "ของแถม" : line.priceCondition === "VAT_EXEMPT" ? "ยกเว้น VAT" : `VAT ${line.vatRatePercent}%`;
              return <div key={line.key} className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="grid grid-cols-[36px_minmax(220px,1fr)_110px_150px_150px_44px] items-center gap-2">
                  <span className="text-center text-sm text-gray-500">{index + 1}</span>
                  <input disabled={amountLocked} value={line.description} onChange={(e) => setLineItems((items) => items.map((item) => item.key === line.key ? { ...item, description: e.target.value } : item))} placeholder="ชื่อสินค้า/บริการ" className={field} />
                  <input disabled={amountLocked} inputMode="decimal" value={line.quantity} onChange={(e) => setLineItems((items) => items.map((item) => item.key === line.key ? { ...item, quantity: e.target.value, lineTotal: null } : item))} className={field} />
                  <input disabled={amountLocked || line.priceCondition === "FREE"} inputMode="decimal" value={line.unitPrice} onChange={(e) => setLineItems((items) => items.map((item) => item.key === line.key ? { ...item, unitPrice: e.target.value, lineTotal: null } : item))} placeholder="0.0000000000" aria-label={`ราคาต่อหน่วยบรรทัดที่ ${index + 1} (ทศนิยมไม่เกิน 10 ตำแหน่ง)`} className={field} />
                  <div className="text-right">
                    <input
                      disabled={amountLocked || line.priceCondition === "FREE"}
                      inputMode="decimal"
                      value={line.lineTotal ?? fmtSatang(line.totalCondition === "VAT_INCLUDED" ? calculated?.totalSatang ?? 0 : calculated?.baseSatang ?? 0, { zeroDash: false })}
                      onFocus={() => {
                        if (line.lineTotal !== null) return;
                        setLineItems((items) => items.map((item) => item.key === line.key ? { ...item, lineTotal: satangToPlainInput(line.totalCondition === "VAT_INCLUDED" ? calculated?.totalSatang ?? 0 : calculated?.baseSatang ?? 0) } : item));
                      }}
                      onChange={(e) => setLineItems((items) => items.map((item) => item.key === line.key ? { ...item, lineTotal: e.target.value } : item))}
                      onClick={(e) => e.currentTarget.select()}
                      onBlur={() => setLineItems((items) => items.map((item) => item.key === line.key && item.lineTotal?.trim() === "" ? { ...item, lineTotal: null } : item))}
                      aria-label={`ราคารวมบรรทัดที่ ${index + 1}`}
                      className={`${field} text-right font-medium tabular-nums`}
                    />
                    <span className="text-[11px] text-gray-500">{condition}</span>
                  </div>
                  <button type="button" disabled={amountLocked} onClick={() => setPriceConditionLineKey(line.key)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-40"><EllipsisVertical size={18} /></button>
                </div>
                {lineItems.length > 1 && !amountLocked && <button type="button" onClick={() => setLineItems((items) => items.filter((item) => item.key !== line.key))} className="mt-1 inline-flex items-center gap-1 text-[11px] text-rose-600"><Trash2 size={12} /> ลบบรรทัด</button>}
              </div>;
            })}</div></div></div>
            <button type="button" disabled={amountLocked} onClick={() => setLineItems((items) => [...items, { ...emptyLine(`edit-line-${nextLineKey.current++}`, vatRate), totalCondition: invoiceTotalCondition }])} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-medium text-sky-700 disabled:opacity-40"><Plus size={15} /> เพิ่มบรรทัด</button>
            <div className="mt-4 ml-auto grid max-w-sm grid-cols-[1fr_auto_36px] items-center gap-x-3 gap-y-2 border-t border-sky-200 pt-4 text-sm"><span>ยอดรวม</span><strong className="text-right">{fmtSatang(base, { zeroDash: false })}</strong><button type="button" disabled={amountLocked} onClick={() => setTotalConditionOpen(true)} aria-label="เงื่อนไขยอดรวม" className="rounded-lg p-1.5 text-gray-500 hover:bg-white disabled:opacity-40"><EllipsisVertical size={18} /></button><span>ภาษี 7%</span><strong className="text-right">{fmtSatang(vat, { zeroDash: false })}</strong><span /><span className="font-semibold">ยอดเงินสุทธิ</span><strong className="text-right text-base">{fmtSatang(total, { zeroDash: false })}</strong><span /></div>
          </section>
          <label className="mt-4 flex items-start gap-2.5 rounded-lg bg-gray-50 p-3"><input type="checkbox" checked={form.isClaimable} onChange={(e) => setForm({ ...form, isClaimable: e.target.checked })} className="mt-0.5 h-4 w-4" /><span className="text-sm text-gray-700">ภาษีซื้อใบนี้ขอเครดิตได้<span className="mt-0.5 block text-xs text-gray-500">เอาติ๊กออกถ้าเป็นภาษีซื้อต้องห้าม — ยังอยู่ในรายงาน แต่ไม่ถูกหักใน ภ.พ.30</span></span></label>
          <section className="mt-4 rounded-lg border border-violet-200 bg-violet-50/50 p-4">
            <p className="text-sm font-medium text-gray-800">หักภาษี ณ ที่จ่าย (ถ้ามี)</p>
            <p className="mt-1 text-xs text-gray-500">เลือกและแก้ข้อมูลได้เหมือนตอนเพิ่มใบกำกับ</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className={`${label} sm:col-span-2`}>ประเภทเงินได้<select disabled={amountLocked} value={whtIncomeType} onChange={(e) => { const selected = WHT_INCOME_TYPES.find((item) => item.label === e.target.value); setWhtIncomeType(e.target.value); setWhtRatePercent(selected ? String(selected.rate * 100) : ""); }} className={field}><option value="">ไม่หักภาษี ณ ที่จ่าย</option>{WHT_INCOME_TYPES.filter((item) => item.common !== "PND3").map((item) => <option key={item.label} value={item.label}>{item.label} — {item.rate * 100}%</option>)}</select></label>
              {whtIncomeType && <><label className={label}>ฐานที่ใช้หัก (บาท)<input disabled={amountLocked} inputMode="decimal" value={whtBaseAmount} onChange={(e) => setWhtBaseAmount(e.target.value)} placeholder={fmtSatang(base, { zeroDash: false })} className={field} /></label><label className={label}>อัตราหัก (%)<input disabled={amountLocked} inputMode="decimal" value={whtRatePercent} onChange={(e) => setWhtRatePercent(e.target.value)} className={field} /></label><div className="rounded-lg border border-violet-100 bg-white px-3 py-2 sm:col-span-2"><span className="text-xs text-gray-500">ที่อยู่ในหนังสือรับรอง 50 ทวิ</span><p className="mt-1 text-sm text-gray-800">{form.vendorAddress || "กรุณากรอกที่อยู่ผู้ขายตามสาขาด้านบน"}</p></div><div className="grid grid-cols-2 gap-2 sm:col-span-2"><div className="rounded-lg bg-white px-3 py-2"><span className="block text-xs text-gray-500">ภาษีหัก</span><strong>{fmtSatang(wht.amount, { zeroDash: false })}</strong></div><div className="rounded-lg bg-white px-3 py-2"><span className="block text-xs text-gray-500">จ่ายสุทธิ</span><strong>{fmtSatang(total - wht.amount, { zeroDash: false })}</strong></div></div></>}
            </div>
          </section>
          <section className="mt-4 rounded-lg border border-brand-200 bg-brand-50/50 p-4">
            <p className="text-sm font-medium text-gray-800">ลงบัญชีให้เลย (ไม่บังคับ)</p>
            <p className="mt-1 text-xs text-gray-600">แก้บัญชีค่าใช้จ่าย/สินทรัพย์ วันที่จ่าย และบัญชีที่ใช้จ่ายได้เหมือนตอนเพิ่มใบกำกับ</p>
            {amountLocked && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">ใบสำคัญผ่านรายการแล้ว จึงแสดงข้อมูลเดิมแต่ยังแก้ส่วนบัญชีไม่ได้</p>}
            <div className="mt-3 space-y-2">{expenseLines.map((line, index) => <div key={line.key} className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto]"><div className={label}>บัญชีค่าใช้จ่าย/สินทรัพย์ บรรทัดที่ {index + 1} (เดบิต)<div className="mt-1"><AccountCombobox accounts={expenseAccounts} value={line.accountId} onChange={(accountId) => setExpenseLines((items) => items.map((item) => item.key === line.key ? { ...item, accountId } : item))} disabled={amountLocked} /></div></div><label className={label}>ยอดก่อน VAT (บาท)<input disabled={amountLocked} inputMode="decimal" value={line.amount} onChange={(e) => setExpenseLines((items) => items.map((item) => item.key === line.key ? { ...item, amount: e.target.value } : item))} placeholder={expenseLines.length === 1 ? fmtSatang(Math.abs(base), { zeroDash: false }) : "0.00"} className={field} /></label><button type="button" disabled={amountLocked || expenseLines.length === 1} onClick={() => setExpenseLines((items) => items.filter((item) => item.key !== line.key))} className="mb-0.5 rounded-lg border border-gray-200 p-2 text-gray-500 disabled:opacity-30"><Trash2 size={16} /></button></div>)}</div>
            <button type="button" disabled={amountLocked} onClick={() => setExpenseLines((items) => [...items, { key: `edit-expense-${nextExpenseLineKey.current++}`, accountId: "", amount: "" }])} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-2 text-xs font-medium text-brand-700 disabled:opacity-40"><Plus size={14} /> เพิ่มบรรทัดบัญชี</button>
            <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-white p-3 text-xs"><div><span className="block text-gray-500">ฐานก่อน VAT</span><strong>{fmtSatang(Math.abs(base), { zeroDash: false })}</strong></div><div><span className="block text-gray-500">แบ่งบัญชีแล้ว</span><strong>{fmtSatang(allocationTotal, { zeroDash: false })}</strong></div><div><span className="block text-gray-500">{allocationDifference >= 0 ? "คงเหลือ" : "เกิน"}</span><strong className={allocationDifference === 0 ? "text-emerald-700" : "text-rose-700"}>{fmtSatang(Math.abs(allocationDifference), { zeroDash: false })}</strong></div></div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className={label}>วันที่จ่าย<AccountingDateInput disabled={amountLocked} value={paymentDate} onChange={setPaymentDate} className={field} /></label><div className={label}>บัญชีที่ใช้จ่าย (สมุดรายวันจ่าย)<div className="mt-1"><AccountCombobox accounts={paymentAccounts} value={paymentAccountId} onChange={setPaymentAccountId} disabled={amountLocked} /></div></div></div>
            {(entry || paymentEntry) && <p className="mt-2 text-xs text-gray-500">ใบสำคัญเดิม: {entry?.entryNo ?? "—"}{paymentEntry ? ` / ${paymentEntry.entryNo}` : ""}</p>}
          </section>
          {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        </>}
        <div className="mt-5 flex gap-2"><button type="submit" disabled={submitting || loading || !form} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{submitting ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}</button><button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">ปิด</button></div>
      </form>
    </div>}
    {selectedPriceLine && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-xl rounded-xl bg-white shadow-xl"><div className="flex items-center justify-between border-b px-5 py-4"><h3 className="text-lg font-semibold">เงื่อนไขราคา</h3><button type="button" onClick={() => setPriceConditionLineKey(null)}><X size={20} /></button></div><div className="space-y-3 p-5">{([['FREE', 'สินค้านี้เป็นของแถม'], ['VAT_EXEMPT', 'ได้รับยกเว้นภาษีมูลค่าเพิ่ม'], ['VAT', 'มีภาษีมูลค่าเพิ่มหรือกำหนดเอง']] as Array<[PurchaseTaxPriceCondition, string]>).map(([value, text]) => <label key={value} className="flex items-center gap-3 text-sm"><input type="radio" checked={selectedPriceLine.priceCondition === value} onChange={() => setLineItems((items) => items.map((item) => item.key === selectedPriceLine.key ? { ...item, priceCondition: value, lineTotal: value === "FREE" ? null : item.lineTotal } : item))} />{text}</label>)}{selectedPriceLine.priceCondition === "VAT" && <label className="ml-7 block max-w-xs text-xs text-gray-500">อัตราภาษีมูลค่าเพิ่ม<div className="mt-1 flex items-center gap-2"><input inputMode="decimal" value={selectedPriceLine.vatRatePercent} onChange={(e) => setLineItems((items) => items.map((item) => item.key === selectedPriceLine.key ? { ...item, vatRatePercent: e.target.value } : item))} className={field} /><span>%</span></div></label>}</div><div className="flex justify-end border-t px-5 py-4"><button type="button" onClick={() => setPriceConditionLineKey(null)} className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white">บันทึก</button></div></div></div>}
    {totalConditionOpen && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-md rounded-xl bg-white shadow-xl"><div className="flex items-center justify-between border-b px-5 py-4"><h3 className="text-lg font-semibold">เงื่อนไขยอดรวม</h3><button type="button" onClick={() => setTotalConditionOpen(false)}><X size={20} /></button></div><div className="space-y-3 p-5">{([['VAT_INCLUDED', 'ยอดรวมภาษี 7%'], ['VAT_EXCLUDED', 'ยอดก่อนภาษี 7%']] as Array<[PurchaseTaxTotalCondition, string]>).map(([value, text]) => <label key={value} className="flex items-center gap-3 text-sm"><input type="radio" name="edit-invoice-total-condition" checked={invoiceTotalCondition === value} onChange={() => setLineItems((items) => items.map((item) => ({ ...item, totalCondition: value })))} />{text}</label>)}</div><div className="flex justify-end border-t px-5 py-4"><button type="button" onClick={() => setTotalConditionOpen(false)} className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white">บันทึก</button></div></div></div>}
  </>;
}
