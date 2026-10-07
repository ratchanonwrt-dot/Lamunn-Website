"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useServerRefresh } from "./useServerRefresh";

export interface PartnerListItem {
  id: string;
  name: string;
  type: "DEBTOR" | "CREDITOR";
  phone: string | null;
  taxId: string | null;
  branchTag: string | null;
  address: string | null;
  note: string | null;
  isActive: boolean;
  usedCount: number;
}

const TYPE_LABELS: Record<string, string> = {
  CREDITOR: "เจ้าหนี้ / ซัพพลายเออร์ (เราจ่ายให้)",
  DEBTOR: "ลูกหนี้ (ค้างรับจากเรา)",
};
const TYPE_ORDER: PartnerListItem["type"][] = ["CREDITOR", "DEBTOR"];

/** รายชื่อคู่ค้าพร้อมช่องค้นหาและแก้ไขในแถว
 *
 * ค้นหาฝั่งเบราว์เซอร์ล้วน — คู่ค้ามีหลักร้อยราย โหลดมาทั้งหมดครั้งเดียวแล้วกรองในหน่วยความจำ
 * เร็วกว่าและไม่ต้องยิงเซิร์ฟเวอร์ทุกตัวอักษรที่พิมพ์
 *
 * แก้/ปิดใช้/ลบ แล้วแถวเปลี่ยนบนจอทันทีที่ API ตอบ (แก้สำเนาในหน่วยความจำก่อน)
 * ส่วน router.refresh() วิ่งเบื้องหลังเพื่อ sync ข้อมูลจากเซิร์ฟเวอร์ตามมา — ไม่ต้องรอหน้าโหลดซ้ำ */
export default function PartnerList({ partners, canEdit }: { partners: PartnerListItem[]; canEdit: boolean }) {
  const [items, setItems] = useState(partners);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    setItems(partners);
  }, [partners]);

  const patch = (id: string, changes: Partial<PartnerListItem>) =>
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, ...changes } : p)));
  const remove = (id: string) => setItems((prev) => prev.filter((p) => p.id !== id));

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return items;
    return items.filter((p) => [p.name, p.taxId, p.phone, p.branchTag, p.note, p.address].some((f) => (f ?? "").toLowerCase().includes(q)));
  }, [items, q]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-96">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อ / เลขผู้เสียภาษี / สาขา / เบอร์โทร / หมายเหตุ"
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-9 text-sm text-gray-900"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="ล้างคำค้น"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <span className="text-sm text-gray-500">
          {q ? `พบ ${filtered.length} จาก ${items.length} ราย` : `ทั้งหมด ${items.length} ราย`}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-gray-700">ยังไม่มีคู่ค้า</p>
          <p className="mt-1 text-sm text-gray-500">เพิ่มทีละคน หรือนำเข้าจาก Excel ด้านบน</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500">
          ไม่พบคู่ค้าที่ตรงกับ &ldquo;{query}&rdquo;
        </div>
      ) : (
        <div className="space-y-5">
          {TYPE_ORDER.filter((t) => filtered.some((p) => p.type === t)).map((type) => (
            <div key={type} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2.5">
                <p className="text-sm font-semibold text-gray-800">{TYPE_LABELS[type]}</p>
                <span className="text-xs text-gray-400">{filtered.filter((p) => p.type === type).length} ราย</span>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {filtered
                    .filter((p) => p.type === type)
                    .map((p) =>
                      editingId === p.id ? (
                        <tr key={p.id} className="border-b border-gray-100 bg-brand-50/40">
                          <td colSpan={7} className="p-4">
                            <PartnerEditForm
                              partner={p}
                              onSaved={(changes) => {
                                patch(p.id, changes);
                                setEditingId(null);
                              }}
                              onCancel={() => setEditingId(null)}
                            />
                          </td>
                        </tr>
                      ) : (
                        <tr key={p.id} className={`border-b border-gray-50 ${!p.isActive ? "opacity-40" : ""}`}>
                          <td className="py-2 pl-4 text-gray-800">
                            <Highlight text={p.name} query={q} />
                            {!p.isActive && <span className="ml-2 text-xs font-normal text-gray-400">(ปิดใช้งาน)</span>}
                          </td>
                          <td className="py-2 text-xs text-gray-400">{p.phone ?? ""}</td>
                          <td className="py-2 font-mono text-xs text-gray-400">{p.taxId ?? ""}</td>
                          <td className="py-2 text-xs text-gray-500">{p.branchTag ? `สาขา/สำนักงานใหญ่: ${p.branchTag}` : ""}</td>
                          <td className="py-2 text-xs text-gray-400">{p.note ?? ""}</td>
                          <td className="w-24 py-2 text-right text-xs text-gray-400">
                            {p.usedCount ? `${p.usedCount} รายการ` : ""}
                          </td>
                          <td className="w-40 py-2 pr-4">
                            {canEdit && (
                              <RowActions
                                partner={p}
                                onEdit={() => setEditingId(p.id)}
                                onToggled={(isActive) => patch(p.id, { isActive })}
                                onRemoved={() => remove(p.id)}
                              />
                            )}
                          </td>
                        </tr>
                      )
                    )}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** เน้นส่วนที่ตรงกับคำค้นให้เห็นง่ายเวลากวาดตาหารายชื่อ */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const i = text.toLowerCase().indexOf(query);
  if (i === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-amber-200 px-0.5">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

function RowActions({
  partner,
  onEdit,
  onToggled,
  onRemoved,
}: {
  partner: PartnerListItem;
  onEdit: () => void;
  onToggled: (isActive: boolean) => void;
  onRemoved: () => void;
}) {
  const { refresh } = useServerRefresh();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleActive() {
    setBusy(true);
    setError(null);
    const next = !partner.isActive;
    const res = await fetch(`/api/accounting/partners/${partner.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: next }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "ทำรายการไม่สำเร็จ");
      return;
    }
    onToggled(next);
    refresh();
  }

  async function remove() {
    if (!confirm(`ลบคู่ค้า "${partner.name}" ทิ้ง?`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/accounting/partners/${partner.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "ลบไม่สำเร็จ");
      return;
    }
    onRemoved();
    refresh();
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-xs text-rose-600">{error}</span>}
      <button type="button" onClick={onEdit} className="text-xs text-brand-700 hover:underline">
        แก้ไข
      </button>
      <button type="button" disabled={busy} onClick={toggleActive} className="text-xs text-gray-500 hover:underline disabled:opacity-50">
        {partner.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
      </button>
      <button type="button" disabled={busy} onClick={remove} className="text-xs text-rose-500 hover:underline disabled:opacity-50">
        ลบ
      </button>
    </div>
  );
}

function PartnerEditForm({
  partner,
  onSaved,
  onCancel,
}: {
  partner: PartnerListItem;
  onSaved: (changes: Partial<PartnerListItem>) => void;
  onCancel: () => void;
}) {
  const { refresh } = useServerRefresh();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: partner.name,
    type: partner.type,
    phone: partner.phone ?? "",
    taxId: partner.taxId ?? "",
    branchTag: partner.branchTag ?? "",
    address: partner.address ?? "",
    note: partner.note ?? "",
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/accounting/partners/${partner.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    // แสดงค่าที่กรอกทันที (ช่องว่างเก็บเป็น null เหมือนที่ API ทำ) — เซิร์ฟเวอร์จะ sync ค่าจริงตามมา
    onSaved({
      name: form.name.trim(),
      type: form.type,
      phone: form.phone.trim() || null,
      taxId: form.taxId.trim() || null,
      branchTag: form.branchTag.trim() || null,
      address: form.address.trim() || null,
      note: form.note.trim() || null,
    });
    refresh();
  }

  const field = "mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900";
  const label = "text-xs text-gray-500";

  return (
    <form onSubmit={save}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className={`${label} lg:col-span-2`}>
          ชื่อ
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} />
        </label>
        <label className={label}>
          ประเภท
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as PartnerListItem["type"] })}
            className={field}
          >
            <option value="CREDITOR">เจ้าหนี้ / ซัพพลายเออร์</option>
            <option value="DEBTOR">ลูกหนี้</option>
          </select>
        </label>
        <label className={label}>
          เลขประจำตัวผู้เสียภาษี
          <input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} maxLength={13} className={field} />
        </label>
        <label className={label}>
          เบอร์โทร
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={field} />
        </label>
        <label className={label}>
          สาขา / สำนักงานใหญ่
          <input
            value={form.branchTag}
            onChange={(e) => setForm({ ...form, branchTag: e.target.value })}
            placeholder="เช่น สำนักงานใหญ่ หรือ 00001"
            className={field}
          />
        </label>
        <label className={`${label} lg:col-span-2`}>
          ที่อยู่
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={field} />
        </label>
        <label className={`${label} lg:col-span-4`}>
          หมายเหตุ
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={field} />
        </label>
      </div>

      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {busy ? "กำลังบันทึก..." : "บันทึก"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
          ยกเลิก
        </button>
      </div>
    </form>
  );
}
