"use client";

import { FormEvent, useState } from "react";
import { Pencil, X } from "lucide-react";
import { useServerRefresh } from "./useServerRefresh";
import { WHT_FORM_SHORT, WHT_INCOME_TYPES } from "@/lib/accounting/whtTypes";
import { formatAccountingDate } from "@/lib/accounting/dateFormat";

interface CertificateDetails {
  id: string;
  docNo: string;
  payDate: string;
  formType: "PND3" | "PND53";
  payeeName: string;
  payeeTaxId: string | null;
  payeeAddress: string | null;
  payeeBranchTag: string | null;
  incomeType: string;
  note: string | null;
  baseAmount: number;
  whtRate: number;
  whtAmount: number;
}

export default function EditWhtCertificateButton({ id }: { id: string }) {
  const { refresh, refreshing } = useServerRefresh();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CertificateDetails | null>(null);

  async function openDialog() {
    setOpen(true); setLoading(true); setError(null);
    const response = await fetch(`/api/accounting/wht/${id}`);
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) return setError(data.error ?? "โหลดข้อมูลไม่สำเร็จ");
    setForm(data.certificate);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setSubmitting(true); setError(null);
    const response = await fetch(`/api/accounting/wht/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payeeName: form.payeeName, payeeTaxId: form.payeeTaxId, payeeAddress: form.payeeAddress, payeeBranchTag: form.payeeBranchTag, incomeType: form.incomeType, note: form.note }),
    });
    const data = await response.json().catch(() => ({}));
    setSubmitting(false);
    if (!response.ok) return setError(data.error ?? "บันทึกไม่สำเร็จ");
    setOpen(false);
    refresh();
  }

  const field = "mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900";
  const label = "text-xs text-gray-500";
  const incomeChoices = form && !WHT_INCOME_TYPES.some((item) => item.label === form.incomeType)
    ? [{ label: form.incomeType, rate: form.whtRate, common: "BOTH" as const }, ...WHT_INCOME_TYPES]
    : WHT_INCOME_TYPES;

  return <>
    <button type="button" onClick={openDialog} disabled={refreshing} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50">
      <Pencil size={12} /> แก้ไข
    </button>
    {open && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-4 print:hidden">
      <form onSubmit={submit} className="my-8 w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3"><div><h2 className="font-semibold text-gray-900">แก้ไขหนังสือรับรอง 50 ทวิ</h2>{form && <p className="mt-0.5 text-xs text-gray-500">{form.docNo} · {WHT_FORM_SHORT[form.formType]}</p>}</div><button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X size={18}/></button></div>
        {loading && <p className="py-8 text-center text-sm text-gray-500">กำลังโหลด...</p>}
        {form && <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className={label}>ชื่อผู้ถูกหักภาษี<input required value={form.payeeName} onChange={(event) => setForm({ ...form, payeeName: event.target.value })} className={field}/></label>
            <label className={label}>เลขประจำตัวผู้เสียภาษี<input inputMode="numeric" maxLength={13} value={form.payeeTaxId ?? ""} onChange={(event) => setForm({ ...form, payeeTaxId: event.target.value })} className={field}/></label>
            <label className={`${label} sm:col-span-2`}>ที่อยู่ผู้ถูกหักภาษี<input required={form.formType === "PND3"} value={form.payeeAddress ?? ""} onChange={(event) => setForm({ ...form, payeeAddress: event.target.value })} className={field}/></label>
            {form.formType === "PND53" && <label className={`${label} sm:col-span-2`}>สำนักงานใหญ่/สาขา<input required placeholder="เช่น สำนักงานใหญ่ หรือ 00001" value={form.payeeBranchTag ?? ""} onChange={(event) => setForm({ ...form, payeeBranchTag: event.target.value })} className={field}/></label>}
            <label className={`${label} sm:col-span-2`}>ประเภทเงินได้<select value={form.incomeType} onChange={(event) => setForm({ ...form, incomeType: event.target.value })} className={field}>{incomeChoices.map((item) => <option key={item.label} value={item.label}>{item.label}</option>)}</select></label>
            <label className={`${label} sm:col-span-2`}>หมายเหตุ<input value={form.note ?? ""} onChange={(event) => setForm({ ...form, note: event.target.value })} className={field}/></label>
          </div>
          <div className="mt-4 grid gap-2 rounded-xl bg-gray-50 p-3 text-xs sm:grid-cols-4"><div><span className="block text-gray-500">วันที่จ่าย</span><strong>{formatAccountingDate(form.payDate)}</strong></div><div><span className="block text-gray-500">ฐานภาษี</span><strong>{form.baseAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</strong></div><div><span className="block text-gray-500">อัตรา</span><strong>{(form.whtRate * 100).toFixed(2)}%</strong></div><div><span className="block text-gray-500">ภาษีที่หัก</span><strong>{form.whtAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</strong></div></div>
          <p className="mt-2 text-xs text-gray-500">ยอดและวันที่ต้องแก้จากเอกสารต้นทาง เพื่อให้ตรงกับสมุดรายวัน · ภ.ง.ด.3 ไม่แสดงสาขา ส่วน ภ.ง.ด.53 แสดงสำนักงานใหญ่/สาขาตามที่กรอก</p>
        </>}
        {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="mt-5 flex gap-2"><button type="submit" disabled={!form || loading || submitting || refreshing} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{submitting ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}</button><button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">ปิด</button></div>
      </form>
    </div>}
  </>;
}
