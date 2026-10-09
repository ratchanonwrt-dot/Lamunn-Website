"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileSearch, Loader2, UploadCloud } from "lucide-react";
import JournalEntryForm, { type JournalEntryInitial } from "./JournalEntryForm";

interface AccountOption { id: string; code: string; nameTh: string; vatRole?: string | null }
interface BranchOption { id: string; name: string }
interface PartnerOption { id: string; name: string; type: "DEBTOR" | "CREDITOR"; phone: string | null; taxId?: string | null }
interface AiResult {
  date: string; journalType: string; description: string; docNo: string | null;
  vendor: { name: string; taxId: string | null; branchTag: string | null; address: string | null };
  isClaimableVat: boolean; whtFormType: "PND3" | "PND53" | null; whtRatePercent: number | null; incomeType: string | null;
  confidence: number; warnings: string[];
  lines: { accountCode: string; debitSatang: number; creditSatang: number; memo: string; docNo: string | null }[];
}

const CHUNK_BYTES = 3 * 1024 * 1024;
const MAX_BYTES = 50 * 1024 * 1024;

function satangText(value: number) {
  const absolute = Math.abs(value);
  return `${value < 0 ? "-" : ""}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readApiResponse(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    // Vercel อาจตอบ plain text เมื่อ function timeout/crash จึงห้ามเรียก response.json() ตรง ๆ
    return { error: response.ok ? "เซิร์ฟเวอร์ตอบข้อมูลไม่สมบูรณ์" : `เซิร์ฟเวอร์ประมวลผลไม่สำเร็จ (HTTP ${response.status}) กรุณาลองใหม่` };
  }
}

export default function AiAutokeyUploader({ accounts, branches, partners }: { accounts: AccountOption[]; branches: BranchOption[]; partners: PartnerOption[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [result, setResult] = useState<AiResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function analyze() {
    if (!file) return;
    setBusy(true); setError(null); setResult(null); setProgress(1);
    try {
      if (file.size > MAX_BYTES) throw new Error("ไฟล์ต้องมีขนาดไม่เกิน 50 MB");
      const hash = await sha256(file);
      const createRes = await fetch("/api/accounting/ai-autokey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: file.name, mimeType: file.type, fileSize: file.size, fileHash: hash }) });
      const created = await readApiResponse(createRes);
      if (!createRes.ok) throw new Error(created.error || "เตรียมอัปโหลดไม่สำเร็จ");
      setDocumentId(created.documentId);
      const totalChunks = Math.ceil(file.size / CHUNK_BYTES);
      for (let index = 0; index < totalChunks; index += 1) {
        const chunk = file.slice(index * CHUNK_BYTES, Math.min(file.size, (index + 1) * CHUNK_BYTES));
        const uploadRes = await fetch(`/api/accounting/ai-autokey/${created.documentId}/chunk?index=${index}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: chunk });
        const uploaded = await readApiResponse(uploadRes);
        if (!uploadRes.ok) throw new Error(uploaded.error || "อัปโหลดไฟล์ไม่สำเร็จ");
        setProgress(Math.round(((index + 1) / totalChunks) * 70));
      }
      setProgress(75);
      const analyzeRes = await fetch(`/api/accounting/ai-autokey/${created.documentId}/analyze`, { method: "POST" });
      const analyzed = await readApiResponse(analyzeRes);
      if (!analyzeRes.ok) throw new Error(analyzed.error || "AI อ่านเอกสารไม่สำเร็จ");
      setResult(analyzed.result); setProgress(100);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เกิดข้อผิดพลาด");
    } finally { setBusy(false); }
  }

  const review = useMemo(() => {
    if (!result) return null;
    const accountByCode = new Map(accounts.map((account) => [account.code, account.id]));
    const taxId = result.vendor.taxId?.replace(/\D/g, "");
    const partner = partners.find((item) => item.taxId?.replace(/\D/g, "") === taxId);
    const initial: JournalEntryInitial = {
      date: result.date, journalType: result.journalType, description: result.description,
      lines: result.lines.map((line) => ({ accountId: accountByCode.get(line.accountCode) || "", debit: line.debitSatang ? satangText(line.debitSatang) : "", credit: line.creditSatang ? satangText(line.creditSatang) : "", branchId: "", partnerId: partner?.id || "", memo: line.memo, docNo: line.docNo || "" })),
    };
    return { initial, unknownCodes: result.lines.filter((line) => !accountByCode.has(line.accountCode)).map((line) => line.accountCode) };
  }, [accounts, partners, result]);

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-bold text-gray-900">AI Autokey</h1><p className="mt-1 text-sm text-gray-500">AI เตรียมใบสำคัญร่างจาก PDF/JPG/PNG ให้คนตรวจทุกครั้งก่อนผ่านรายการ</p></div><Link href="/accounting/journal" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">← กลับสมุดรายวัน</Link></header>
    {!result && <section className="rounded-xl border border-gray-200 bg-white p-5">
      <label className="block cursor-pointer rounded-xl border-2 border-dashed border-violet-200 bg-violet-50/50 p-8 text-center hover:border-violet-400"><input type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] || null); setError(null); setProgress(0); }} /><UploadCloud className="mx-auto text-violet-600" size={34} /><p className="mt-3 text-sm font-semibold text-gray-800">{file?.name || "เลือก PDF, JPG หรือ PNG"}</p><p className="mt-1 text-xs text-gray-500">ไม่เกิน 50 MB · เก็บไฟล์ไว้กับใบสำคัญเพื่อตรวจย้อนหลัง</p></label>
      {progress > 0 && <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full bg-violet-600 transition-all" style={{ width: `${progress}%` }} /></div>}
      {busy && <p className="mt-2 flex items-center justify-center gap-2 text-sm text-violet-700"><Loader2 size={16} className="animate-spin" />{progress < 75 ? "กำลังอัปโหลดเอกสาร..." : "AI กำลังอ่านและจัดทำใบสำคัญร่าง..."}</p>}
      {error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <button type="button" onClick={analyze} disabled={!file || busy} className="mt-4 w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-40">{busy ? "กำลังทำงาน..." : "ตรวจเอกสารและสร้างร่าง"}</button>
    </section>}
    {result && review && documentId && <div className="grid gap-5 xl:grid-cols-[minmax(20rem,0.75fr)_minmax(0,1.4fr)]">
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white"><div className="flex items-center justify-between border-b px-4 py-3"><span className="flex items-center gap-2 text-sm font-semibold"><FileSearch size={17} />เอกสารต้นฉบับ</span><span className="text-xs text-emerald-700">ความมั่นใจ {result.confidence}%</span></div>{file?.type === "application/pdf" ? <iframe title="เอกสารต้นฉบับ" src={previewUrl || undefined} className="h-[45rem] w-full" /> : <img src={previewUrl || undefined} alt="เอกสารต้นฉบับ" className="max-h-[45rem] w-full object-contain" />}</section>
      <div className="space-y-4">
        {(result.warnings.length > 0 || review.unknownCodes.length > 0) && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><p className="flex items-center gap-2 font-semibold"><AlertTriangle size={17} />จุดที่ต้องตรวจสอบ</p><ul className="mt-2 list-disc space-y-1 pl-5">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}{review.unknownCodes.map((code) => <li key={code}>ไม่พบรหัสบัญชี {code} กรุณาเลือกใหม่</li>)}</ul></div>}
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">ผู้ขาย: {result.vendor.name || "อ่านไม่พบ"}{result.vendor.taxId ? ` · เลขผู้เสียภาษี ${result.vendor.taxId}` : ""}{result.whtFormType ? ` · AI เสนอ ${result.whtFormType}${result.whtRatePercent ? ` อัตรา ${result.whtRatePercent}%` : ""}` : ""}</div>
        <div className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs text-amber-800">สิทธิภาษีซื้อ<select value={result.isClaimableVat ? "claimable" : "nonclaimable"} onChange={(event) => setResult((current) => current ? { ...current, isClaimableVat: event.target.value === "claimable" } : current)} className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"><option value="claimable">ภาษีซื้อขอคืนได้</option><option value="nonclaimable">ภาษีซื้อต้องห้าม/รวมค่าใช้จ่าย</option></select></label>
          <label className="text-xs text-amber-800">หัก ณ ที่จ่าย<select value={result.whtFormType ?? ""} onChange={(event) => setResult((current) => current ? { ...current, whtFormType: event.target.value ? event.target.value as "PND3" | "PND53" : null } : current)} className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"><option value="">ไม่มี</option><option value="PND3">ภ.ง.ด.3</option><option value="PND53">ภ.ง.ด.53</option></select></label>
          <label className="text-xs text-amber-800">อัตราหัก (%)<input type="number" step="0.01" value={result.whtRatePercent ?? ""} onChange={(event) => setResult((current) => current ? { ...current, whtRatePercent: Number(event.target.value) || null } : current)} className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm" /></label>
          <label className="text-xs text-amber-800">ประเภทเงินได้<input value={result.incomeType ?? ""} onChange={(event) => setResult((current) => current ? { ...current, incomeType: event.target.value } : current)} className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm" /></label>
        </div>
        <JournalEntryForm accounts={accounts} branches={branches} partners={partners} defaultDate={result.date} initial={review.initial} autokeyDocumentId={documentId} autokeyTaxReview={{ isClaimableVat: result.isClaimableVat, whtFormType: result.whtFormType, whtRatePercent: result.whtRatePercent, incomeType: result.incomeType }} />
      </div>
    </div>}
  </div>;
}
