"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Download, FilePlus2, Plus, Printer, QrCode, Search, ShoppingCart } from "lucide-react";
import { useServerRefresh } from "./useServerRefresh";
import { fmtSatang, signedInputToSatang } from "@/lib/accounting/money";

export type FixedAssetRow = {
  id: string;
  code: string;
  name: string;
  category: string;
  status: "ACTIVE" | "DISPOSED";
  quantity: number;
  remainingQuantity: number;
  purchaseDate: string;
  availableDate: string;
  invoiceNo: string | null;
  branchId: string | null;
  branchName: string | null;
  assetAccountId: string;
  accountLabel: string;
  dataIncomplete: boolean;
  costSatang: number;
  accumulatedSatang: number;
  monthDepreciationSatang: number;
  bookValueSatang: number;
  usefulLifeMonths: number;
  residualValueSatang: number;
  note: string | null;
};

type Option = { id: string; label: string };

const CATEGORY_LABELS: Record<string, string> = {
  LAND: "ที่ดิน", BUILDING: "อาคาร", OFFICE_EQUIPMENT: "อุปกรณ์สำนักงาน", COMPUTER: "คอมพิวเตอร์และอุปกรณ์คอมพิวเตอร์",
  FURNITURE: "เครื่องตกแต่งสำนักงาน", MACHINERY: "เครื่องจักรและอุปกรณ์ในโรงงาน", VEHICLE: "ยานพาหนะ", SOFTWARE: "ซอฟต์แวร์คอมพิวเตอร์",
};
const CATEGORY_MONTHS: Record<string, number> = { LAND: 0, BUILDING: 240, OFFICE_EQUIPMENT: 60, COMPUTER: 36, FURNITURE: 60, MACHINERY: 60, VEHICLE: 60, SOFTWARE: 36 };
const fmt = (satang: number) => fmtSatang(satang, { zeroDash: false });
const inputClass = "mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500";

export default function FixedAssetRegister({ initialAssets, accounts, branches, year, month, canEdit, initialFilters }: {
  initialAssets: FixedAssetRow[];
  accounts: Option[];
  branches: Option[];
  year: number;
  month: number;
  canEdit: boolean;
  initialFilters: { query: string; category: string; status: string; branch: string };
}) {
  const [assets, setAssets] = useState(initialAssets);
  const [tab, setTab] = useState<"register" | "depreciation">("register");
  const [query, setQuery] = useState(initialFilters.query);
  const [category, setCategory] = useState(initialFilters.category);
  const [status, setStatus] = useState(initialFilters.status);
  const [branch, setBranch] = useState(initialFilters.branch);
  const [addOpen, setAddOpen] = useState(false);
  const [selling, setSelling] = useState<FixedAssetRow | null>(null);
  const [editing, setEditing] = useState<FixedAssetRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [filtering, startFiltering] = useTransition();
  const { refresh, refreshing, router } = useServerRefresh();

  useEffect(() => setAssets(initialAssets), [initialAssets]);
  useEffect(() => {
    setQuery(initialFilters.query);
    setCategory(initialFilters.category);
    setStatus(initialFilters.status);
    setBranch(initialFilters.branch);
  }, [initialFilters.branch, initialFilters.category, initialFilters.query, initialFilters.status]);
  const filtered = useMemo(() => assets.filter((asset) => {
    const q = query.trim().toLowerCase();
    return (!q || `${asset.code} ${asset.name} ${asset.invoiceNo ?? ""}`.toLowerCase().includes(q))
      && (category === "ALL" || asset.category === category)
      && (status === "ALL" || asset.status === status)
      && (branch === "ALL" || asset.branchId === branch);
  }), [assets, branch, category, query, status]);
  const totals = useMemo(() => assets.reduce((sum, asset) => ({ cost: sum.cost + asset.costSatang, accumulated: sum.accumulated + asset.accumulatedSatang, incomplete: sum.incomplete + (asset.dataIncomplete ? 1 : 0) }), { cost: 0, accumulated: 0, incomplete: 0 }), [assets]);

  function navigatePeriod(nextYear: number, nextMonth: number) {
    router.push(`/accounting/fixed-assets?year=${nextYear}&month=${nextMonth}`);
  }

  function saveFilters(next: { query?: string; category?: string; status?: string; branch?: string }) {
    const values = { query, category, status, branch, ...next };
    const params = new URLSearchParams({ year: String(year), month: String(month) });
    if (values.query) params.set("q", values.query);
    if (values.category !== "ALL") params.set("category", values.category);
    if (values.status !== "ALL") params.set("status", values.status);
    if (values.branch !== "ALL") params.set("branch", values.branch);
    startFiltering(() => router.replace(`/accounting/fixed-assets?${params.toString()}`));
  }

  async function createDepreciationDraft() {
    setBusy(true); setMessage(null);
    const response = await fetch("/api/accounting/fixed-assets/depreciation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year, month }) });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setMessage({ text: data.error || "สร้างใบสำคัญไม่สำเร็จ", error: true });
    setMessage({ text: `สร้างใบสำคัญร่าง ${data.entry.entryNo} แล้ว` });
    refresh();
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-xl font-bold text-gray-900">ทะเบียนทรัพย์สิน</h1><p className="mt-1 text-sm text-gray-500">สร้างจากใบสำคัญที่ผ่านรายการโดยอัตโนมัติ พร้อมคำนวณค่าเสื่อมและประวัติการขาย</p></div>
      {canEdit && <button onClick={() => setAddOpen(true)} className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"><Plus size={16}/>เพิ่มทรัพย์สิน</button>}
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="ทรัพย์สินทั้งหมด" value={`${assets.length} รายการ`} detail={`ใช้งาน ${assets.filter((asset) => asset.status === "ACTIVE").length} รายการ`} />
      <Stat label="ราคาทุนรวม" value={fmt(totals.cost)} detail="บาท" />
      <Stat label="ค่าเสื่อมราคาสะสม" value={fmt(totals.accumulated)} detail={`ณ ${String(month).padStart(2, "0")}/${year}`} />
      <Stat label="ข้อมูลต้องเพิ่มเติม" value={`${totals.incomplete} รายการ`} detail="ไม่ขวางการสร้างทะเบียน" warning={totals.incomplete > 0} />
    </div>
    <div className="flex gap-1 border-b border-gray-200">
      <Tab active={tab === "register"} onClick={() => setTab("register")}>ทะเบียนทรัพย์สิน</Tab>
      <Tab active={tab === "depreciation"} onClick={() => setTab("depreciation")}>ตารางค่าเสื่อมราคา</Tab>
    </div>
    {tab === "register" ? <>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/><input value={query} onChange={(event) => { setQuery(event.target.value); saveFilters({ query: event.target.value }); }} placeholder="ค้นหารหัส ชื่อ หรือเลขที่ใบกำกับ" className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm"/></div>
        <select value={category} onChange={(event) => { setCategory(event.target.value); saveFilters({ category: event.target.value }); }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm"><option value="ALL">ทุกหมวด</option>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select value={status} onChange={(event) => { setStatus(event.target.value); saveFilters({ status: event.target.value }); }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm"><option value="ALL">ทุกสถานะ</option><option value="ACTIVE">ใช้งาน</option><option value="DISPOSED">ขายแล้ว</option></select>
        <select value={branch} onChange={(event) => { setBranch(event.target.value); saveFilters({ branch: event.target.value }); }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm"><option value="ALL">ทุกสาขา</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        {filtering && <span className="self-center text-xs text-gray-400">กำลังกรอง…</span>}
        <Link href={`/print/fixed-assets?year=${year}&month=${month}&report=register`} target="_blank" className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"><Printer size={15}/>PDF A4</Link>
        <a href={`/api/accounting/fixed-assets/export?year=${year}&month=${month}`} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"><Download size={15}/>Excel</a>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white"><table className="w-full min-w-[1180px] text-sm"><thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="px-3 py-3 text-left">รหัส/รายการ</th><th className="px-3 py-3 text-left">หมวด/สาขา</th><th className="px-3 py-3 text-left">วันที่พร้อมใช้</th><th className="px-3 py-3 text-right">จำนวนคงเหลือ</th><th className="px-3 py-3 text-right">ราคาทุน</th><th className="px-3 py-3 text-right">ค่าเสื่อมสะสม</th><th className="px-3 py-3 text-right">มูลค่าคงเหลือ</th><th className="px-3 py-3"></th></tr></thead><tbody>{filtered.map((asset) => <tr key={asset.id} className={`border-t border-gray-100 ${asset.status === "DISPOSED" ? "bg-gray-50 text-gray-400" : ""}`}><td className="px-3 py-3"><p className="font-medium text-gray-900">{asset.code} · {asset.name}</p><p className="mt-0.5 text-xs text-gray-400">{asset.invoiceNo || "ไม่มีเลขที่ใบกำกับ"}{asset.dataIncomplete && <span className="ml-2 text-amber-600">ข้อมูลไม่ครบ</span>}</p></td><td className="px-3 py-3"><p>{CATEGORY_LABELS[asset.category]}</p><p className="text-xs text-gray-400">{asset.branchName || "ยังไม่ระบุสาขา"}</p></td><td className="px-3 py-3">{dateLabel(asset.availableDate)}</td><td className="px-3 py-3 text-right">{asset.remainingQuantity}/{asset.quantity}</td><td className="px-3 py-3 text-right tabular-nums">{fmt(asset.costSatang)}</td><td className="px-3 py-3 text-right tabular-nums">{fmt(asset.accumulatedSatang)}</td><td className="px-3 py-3 text-right tabular-nums">{fmt(asset.bookValueSatang)}</td><td className="px-3 py-3"><div className="flex justify-end gap-2">{canEdit && <button onClick={() => setEditing(asset)} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50">แก้ไข</button>}{canEdit && asset.remainingQuantity > 0 && <button onClick={() => setSelling(asset)} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50"><ShoppingCart size={14}/>ขาย</button>}<Link href={`/print/fixed-assets/label/${asset.id}`} target="_blank" className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50"><QrCode size={14}/>ป้าย QR</Link></div></td></tr>)}</tbody></table>{filtered.length === 0 && <p className="p-8 text-center text-sm text-gray-500">ไม่พบรายการที่ตรงกับตัวกรอง</p>}</div>
    </> : <>
      <div className="flex flex-wrap items-end gap-2"><label className="text-xs text-gray-500">เดือน<select value={month} onChange={(event) => navigatePeriod(year, Number(event.target.value))} className={inputClass}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label><label className="text-xs text-gray-500">ปี ค.ศ.<input type="number" value={year} onChange={(event) => navigatePeriod(Number(event.target.value), month)} className={`${inputClass} w-28`}/></label><Link href={`/print/fixed-assets?year=${year}&month=${month}&report=depreciation`} target="_blank" className="flex h-10 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm text-gray-700"><Printer size={15}/>PDF A4</Link><a href={`/api/accounting/fixed-assets/export?year=${year}&month=${month}`} className="flex h-10 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm text-gray-700"><Download size={15}/>Excel</a>{canEdit && <button disabled={busy || refreshing} onClick={createDepreciationDraft} className="flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white disabled:opacity-50"><FilePlus2 size={15}/>สร้างใบสำคัญร่าง</button>}</div>
      <p className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">หน้านี้แสดงค่าเสื่อมทางบัญชีสำหรับลงบัญชีรายเดือน ข้อมูลทางภาษีเก็บแยกไว้ในทะเบียนเพื่อใช้จัดทำภาษี</p>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white"><table className="w-full min-w-[900px] text-sm"><thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="px-3 py-3 text-left">รหัส/รายการ</th><th className="px-3 py-3 text-left">วิธีคำนวณ</th><th className="px-3 py-3 text-right">ราคาทุน</th><th className="px-3 py-3 text-right">ค่าเสื่อมเดือนนี้</th><th className="px-3 py-3 text-right">ค่าเสื่อมสะสม</th><th className="px-3 py-3 text-right">มูลค่าคงเหลือ</th></tr></thead><tbody>{assets.map((asset) => <tr key={asset.id} className="border-t border-gray-100"><td className="px-3 py-3"><p className="font-medium">{asset.code} · {asset.name}</p></td><td className="px-3 py-3">{asset.usefulLifeMonths ? `เส้นตรง ${asset.usefulLifeMonths} เดือน` : "ไม่คิดค่าเสื่อม"}</td><td className="px-3 py-3 text-right">{fmt(asset.costSatang)}</td><td className="px-3 py-3 text-right font-medium text-brand-700">{fmt(asset.monthDepreciationSatang)}</td><td className="px-3 py-3 text-right">{fmt(asset.accumulatedSatang)}</td><td className="px-3 py-3 text-right">{fmt(asset.bookValueSatang)}</td></tr>)}</tbody></table></div>
    </>}
    {message && <p className={`rounded-lg px-4 py-3 text-sm ${message.error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{message.text}</p>}
    {addOpen && <AddAssetDialog
      accounts={accounts}
      branches={branches}
      onClose={() => setAddOpen(false)}
      onCreated={(asset) => { setAssets((current) => [asset, ...current]); setAddOpen(false); refresh(); }}
    />}
    {editing && <EditAssetDialog
      asset={editing}
      branches={branches}
      onClose={() => setEditing(null)}
      onSaved={(changes) => { setAssets((current) => current.map((asset) => asset.id === editing.id ? { ...asset, ...changes } : asset)); setEditing(null); refresh(); }}
    />}
    {selling && <SellAssetDialog
      asset={selling}
      onClose={() => setSelling(null)}
      onSold={(quantity) => { setAssets((current) => current.map((asset) => asset.id === selling.id ? { ...asset, remainingQuantity: asset.remainingQuantity - quantity, status: asset.remainingQuantity === quantity ? "DISPOSED" : asset.status } : asset)); setSelling(null); setMessage({ text: "บันทึกการขายและสร้างใบสำคัญร่างแล้ว" }); refresh(); }}
    />}
  </div>;
}

function Stat({ label, value, detail, warning }: { label: string; value: string; detail: string; warning?: boolean }) { return <div className={`rounded-xl border bg-white p-4 ${warning ? "border-amber-200" : "border-gray-200"}`}><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-lg font-bold text-gray-900">{value}</p><p className={`mt-1 text-xs ${warning ? "text-amber-600" : "text-gray-400"}`}>{detail}</p></div>; }
function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button onClick={onClick} className={`border-b-2 px-4 py-2 text-sm font-semibold ${active ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500"}`}>{children}</button>; }
function dateLabel(value: string) { const [year, month, day] = value.slice(0, 10).split("-"); return `${day}/${month}/${year}`; }

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-gray-900/50 p-4"><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl"><div className="flex items-center justify-between border-b px-5 py-4"><h2 className="font-bold text-gray-900">{title}</h2><button onClick={onClose} className="text-sm text-gray-500">ปิด</button></div>{children}</div></div>; }

function AddAssetDialog({ accounts, branches, onClose, onCreated }: { accounts: Option[]; branches: Option[]; onClose: () => void; onCreated: (asset: FixedAssetRow) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ name: "", category: "OFFICE_EQUIPMENT", quantity: "1", purchaseDate: today, availableDate: today, unitCost: "", residualValue: "0", usefulLifeMonths: "60", invoiceNo: "", branchId: "", assetAccountId: accounts[0]?.id ?? "", note: "" });
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); const response = await fetch("/api/accounting/fixed-assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const data = await response.json().catch(() => ({})); setBusy(false); if (!response.ok) return setError(data.error || "บันทึกไม่สำเร็จ"); const unitSatang = signedInputToSatang(form.unitCost); onCreated({ id: data.asset.id, code: data.asset.code, name: form.name, category: form.category, status: "ACTIVE", quantity: Number(form.quantity), remainingQuantity: Number(form.quantity), purchaseDate: form.purchaseDate, availableDate: form.availableDate, invoiceNo: form.invoiceNo || null, branchId: form.branchId || null, branchName: branches.find((item) => item.id === form.branchId)?.label ?? null, assetAccountId: form.assetAccountId, accountLabel: accounts.find((item) => item.id === form.assetAccountId)?.label ?? "", dataIncomplete: !form.invoiceNo || !form.branchId, costSatang: unitSatang * Number(form.quantity), accumulatedSatang: 0, monthDepreciationSatang: 0, bookValueSatang: unitSatang * Number(form.quantity), usefulLifeMonths: Number(form.usefulLifeMonths), residualValueSatang: signedInputToSatang(form.residualValue), note: form.note || null }); }
  return <Modal title="เพิ่มทรัพย์สิน" onClose={onClose}><form onSubmit={submit} className="p-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="รายการที่ซื้อ" wide><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass}/></Field><Field label="หมวด"><select value={form.category} onChange={(event) => { const value = event.target.value; setForm({ ...form, category: value, usefulLifeMonths: String(CATEGORY_MONTHS[value]) }); }} className={inputClass}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="สาขา"><select value={form.branchId} onChange={(event) => setForm({ ...form, branchId: event.target.value })} className={inputClass}><option value="">ยังไม่ระบุ</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field><Field label="วันที่ซื้อตามใบกำกับ"><input required type="date" value={form.purchaseDate} onChange={(event) => setForm({ ...form, purchaseDate: event.target.value })} className={inputClass}/></Field><Field label="วันที่พร้อมใช้งาน"><input required type="date" value={form.availableDate} onChange={(event) => setForm({ ...form, availableDate: event.target.value })} className={inputClass}/></Field><Field label="จำนวน"><input required min="1" type="number" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} className={inputClass}/></Field><Field label="ราคาทุนต่อหน่วยก่อนภาษี"><input required inputMode="decimal" value={form.unitCost} onChange={(event) => setForm({ ...form, unitCost: event.target.value })} className={inputClass}/></Field><Field label="อายุใช้งาน (เดือน)"><input required min="0" type="number" value={form.usefulLifeMonths} onChange={(event) => setForm({ ...form, usefulLifeMonths: event.target.value })} className={inputClass}/></Field><Field label="มูลค่าซากรวม"><input inputMode="decimal" value={form.residualValue} onChange={(event) => setForm({ ...form, residualValue: event.target.value })} className={inputClass}/></Field><Field label="บัญชีสินทรัพย์"><select required value={form.assetAccountId} onChange={(event) => setForm({ ...form, assetAccountId: event.target.value })} className={inputClass}>{accounts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field><Field label="เลขที่ใบกำกับ"><input value={form.invoiceNo} onChange={(event) => setForm({ ...form, invoiceNo: event.target.value })} className={inputClass}/></Field><Field label="หมายเหตุ" wide><input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className={inputClass}/></Field></div>{error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">ยกเลิก</button><button disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "กำลังบันทึก…" : "บันทึกและสร้างรหัส"}</button></div></form></Modal>;
}

function EditAssetDialog({ asset, branches, onClose, onSaved }: { asset: FixedAssetRow; branches: Option[]; onClose: () => void; onSaved: (changes: Partial<FixedAssetRow>) => void }) {
  const [form, setForm] = useState({ name: asset.name, category: asset.category, branchId: asset.branchId ?? "", availableDate: asset.availableDate.slice(0, 10), invoiceNo: asset.invoiceNo ?? "", usefulLifeMonths: String(asset.usefulLifeMonths), residualValue: fmt(asset.residualValueSatang), note: asset.note ?? "" });
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); const response = await fetch(`/api/accounting/fixed-assets/${asset.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const data = await response.json().catch(() => ({})); setBusy(false); if (!response.ok) return setError(data.error || "แก้ไขไม่สำเร็จ"); const residualValueSatang = signedInputToSatang(form.residualValue); onSaved({ name: form.name.trim(), category: form.category, branchId: form.branchId || null, branchName: branches.find((item) => item.id === form.branchId)?.label ?? null, availableDate: form.availableDate, invoiceNo: form.invoiceNo.trim() || null, usefulLifeMonths: Number(form.usefulLifeMonths), residualValueSatang, note: form.note.trim() || null, dataIncomplete: !form.invoiceNo.trim() || !form.branchId }); }
  return <Modal title={`แก้ไข ${asset.code}`} onClose={onClose}><form onSubmit={submit} className="p-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="ชื่อทรัพย์สิน" wide><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass}/></Field><Field label="หมวด"><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className={inputClass}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="สาขา"><select value={form.branchId} onChange={(event) => setForm({ ...form, branchId: event.target.value })} className={inputClass}><option value="">ยังไม่ระบุ</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field><Field label="วันที่พร้อมใช้งาน"><input required type="date" value={form.availableDate} onChange={(event) => setForm({ ...form, availableDate: event.target.value })} className={inputClass}/></Field><Field label="เลขที่ใบกำกับ"><input value={form.invoiceNo} onChange={(event) => setForm({ ...form, invoiceNo: event.target.value })} className={inputClass}/></Field><Field label="อายุใช้งาน (เดือน)"><input required min="0" type="number" value={form.usefulLifeMonths} onChange={(event) => setForm({ ...form, usefulLifeMonths: event.target.value })} className={inputClass}/></Field><Field label="มูลค่าซากรวม"><input inputMode="decimal" value={form.residualValue} onChange={(event) => setForm({ ...form, residualValue: event.target.value })} className={inputClass}/></Field><Field label="หมายเหตุ" wide><input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className={inputClass}/></Field></div>{error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">ยกเลิก</button><button disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "กำลังบันทึก…" : "บันทึก"}</button></div></form></Modal>;
}

function SellAssetDialog({ asset, onClose, onSold }: { asset: FixedAssetRow; onClose: () => void; onSold: (quantity: number) => void }) {
  const [form, setForm] = useState({ saleDate: new Date().toISOString().slice(0, 10), quantity: "1", saleBaseAmount: "", vatAmount: "", buyer: "", documentNo: "", note: "" }); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); const response = await fetch(`/api/accounting/fixed-assets/${asset.id}/dispose`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const data = await response.json().catch(() => ({})); setBusy(false); if (!response.ok) return setError(data.error || "บันทึกการขายไม่สำเร็จ"); onSold(Number(form.quantity)); }
  return <Modal title={`ขายทรัพย์สิน ${asset.code}`} onClose={onClose}><form onSubmit={submit} className="p-5"><p className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">ระบบคำนวณค่าเสื่อมถึงวันที่ขายและสร้างใบสำคัญฉบับร่างให้ตรวจสอบก่อนผ่านรายการ</p><div className="grid gap-4 sm:grid-cols-2"><Field label="วันที่ขาย"><input required type="date" value={form.saleDate} onChange={(event) => setForm({ ...form, saleDate: event.target.value })} className={inputClass}/></Field><Field label={`จำนวนที่ขาย (คงเหลือ ${asset.remainingQuantity})`}><input required type="number" min="1" max={asset.remainingQuantity} value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} className={inputClass}/></Field><Field label="ราคาขายก่อนภาษี"><input required inputMode="decimal" value={form.saleBaseAmount} onChange={(event) => setForm({ ...form, saleBaseAmount: event.target.value })} className={inputClass}/></Field><Field label="ภาษีขาย"><input inputMode="decimal" value={form.vatAmount} onChange={(event) => setForm({ ...form, vatAmount: event.target.value })} className={inputClass}/></Field><Field label="เลขที่เอกสารขาย"><input value={form.documentNo} onChange={(event) => setForm({ ...form, documentNo: event.target.value })} className={inputClass}/></Field><Field label="ผู้ซื้อ"><input value={form.buyer} onChange={(event) => setForm({ ...form, buyer: event.target.value })} className={inputClass}/></Field><Field label="หมายเหตุ" wide><input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className={inputClass}/></Field></div>{error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">ยกเลิก</button><button disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "กำลังบันทึก…" : "บันทึกและสร้างใบสำคัญร่าง"}</button></div></form></Modal>;
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={`text-xs font-medium text-gray-600 ${wide ? "sm:col-span-2" : ""}`}>{label}{children}</label>; }
