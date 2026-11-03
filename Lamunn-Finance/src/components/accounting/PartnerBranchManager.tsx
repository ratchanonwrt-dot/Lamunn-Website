"use client";

import { useEffect, useState } from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import { useServerRefresh } from "./useServerRefresh";

export interface PartnerBranchItem {
  id: string;
  branchTag: string;
  address: string;
  isDefault: boolean;
  isActive: boolean;
}

const field = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900";

export default function PartnerBranchManager({
  partnerId,
  partnerName,
  initialBranches,
}: {
  partnerId: string;
  partnerName: string;
  initialBranches: PartnerBranchItem[];
}) {
  const [branches, setBranches] = useState(initialBranches);
  const [branchTag, setBranchTag] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refresh } = useServerRefresh();

  useEffect(() => {
    setBranches(initialBranches);
  }, [initialBranches]);

  async function addBranch(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/accounting/partners/${partnerId}/branches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchTag, address, isDefault: branches.length === 0 }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "เพิ่มสาขาไม่สำเร็จ");
    setBranches((current) => [...current.map((item) => ({ ...item, isDefault: data.branch.isDefault ? false : item.isDefault })), data.branch]);
    setBranchTag("");
    setAddress("");
    refresh();
  }

  async function saveBranch(branch: PartnerBranchItem, changes: Partial<PartnerBranchItem>) {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/accounting/partners/${partnerId}/branches/${branch.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "แก้ไขสาขาไม่สำเร็จ");
    setBranches((current) => current.map((item) => ({ ...item, isDefault: data.branch.isDefault ? item.id === data.branch.id : item.isDefault, ...(item.id === data.branch.id ? data.branch : {}) })));
    refresh();
  }

  async function removeBranch(branch: PartnerBranchItem) {
    if (!confirm(`ลบ ${branch.branchTag} ของ ${partnerName}?`)) return;
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/accounting/partners/${partnerId}/branches/${branch.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "ลบสาขาไม่สำเร็จ");
    setBranches((current) => current
      .filter((item) => item.id !== branch.id)
      .map((item) => ({ ...item, isDefault: data.defaultBranchId ? item.id === data.defaultBranchId : item.isDefault }))
    );
    refresh();
  }

  return (
    <div className="space-y-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-4">
      <div>
        <p className="text-sm font-semibold text-gray-800">สาขาและที่อยู่ของ {partnerName}</p>
        <p className="text-xs text-gray-500">สาขาหลักจะถูกเลือกอัตโนมัติเมื่อบันทึกใบกำกับภาษีซื้อ</p>
      </div>

      {branches.map((branch) => (
        <BranchRow key={branch.id} branch={branch} busy={busy} onSave={(changes) => saveBranch(branch, changes)} onRemove={() => removeBranch(branch)} />
      ))}

      <form onSubmit={addBranch} className="grid gap-2 border-t border-indigo-100 pt-3 sm:grid-cols-[180px_1fr_auto]">
        <input required value={branchTag} onChange={(event) => setBranchTag(event.target.value)} placeholder="สำนักงานใหญ่ หรือ 00001" className={field} />
        <input required value={address} onChange={(event) => setAddress(event.target.value)} placeholder="ที่อยู่ของสาขานี้" className={field} />
        <button type="submit" disabled={busy} className="flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
          <Plus size={15} /> เพิ่มสาขา
        </button>
      </form>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}

function BranchRow({
  branch,
  busy,
  onSave,
  onRemove,
}: {
  branch: PartnerBranchItem;
  busy: boolean;
  onSave: (changes: Partial<PartnerBranchItem>) => void;
  onRemove: () => void;
}) {
  const [branchTag, setBranchTag] = useState(branch.branchTag);
  const [address, setAddress] = useState(branch.address);
  const changed = branchTag.trim() !== branch.branchTag || address.trim() !== branch.address;

  return (
    <div className="grid gap-2 sm:grid-cols-[180px_1fr_auto] sm:items-center">
      <input value={branchTag} onChange={(event) => setBranchTag(event.target.value)} className={field} />
      <input value={address} onChange={(event) => setAddress(event.target.value)} className={field} />
      <div className="flex items-center justify-end gap-2">
        {branch.isDefault ? (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-amber-100 px-2 py-1 text-xs text-amber-700"><Star size={12} /> สาขาหลัก</span>
        ) : (
          <button type="button" disabled={busy} onClick={() => onSave({ isDefault: true })} className="whitespace-nowrap text-xs text-indigo-700 hover:underline disabled:opacity-50">ตั้งเป็นหลัก</button>
        )}
        {changed && <button type="button" disabled={busy} onClick={() => onSave({ branchTag, address })} className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50">บันทึก</button>}
        <button type="button" disabled={busy} onClick={onRemove} aria-label={`ลบ ${branch.branchTag}`} className="rounded p-1 text-rose-500 hover:bg-rose-50 disabled:opacity-50"><Trash2 size={14} /></button>
      </div>
    </div>
  );
}
