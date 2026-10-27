"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatBaht } from "@/lib/format";
import { useCanEdit } from "@/lib/RoleContext";

const VAT_RATE = 0.07;

interface BookingItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

interface MenuItem {
  id: string;
  name: string;
  unitLabel: string | null;
  unitPrice: number | null;
  minPrice: number | null;
}

function labelOf(m: MenuItem) {
  return m.unitLabel ? `${m.name} (${m.unitLabel})` : m.name;
}

// แถวรายการที่เพิ่มไว้แล้ว — แก้ไขได้ทุกช่อง (ไม่ใช่แค่ลบ) บันทึกอัตโนมัติตอนออกจากช่อง
function ItemRow({ bookingId, item }: { bookingId: string; item: BookingItem }) {
  const router = useRouter();
  const canEdit = useCanEdit("CATERING");
  const [description, setDescription] = useState(item.description);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unitPrice, setUnitPrice] = useState(String(item.unitPrice));
  const [saving, setSaving] = useState(false);

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    await fetch(`/api/catering/bookings/${bookingId}/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaving(false);
    router.refresh();
  }

  async function handleRemove() {
    await fetch(`/api/catering/bookings/${bookingId}/items/${item.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
      <input
        disabled={!canEdit}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => description !== item.description && save({ description })}
        className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm outline-none focus:border-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
      />
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <input
          type="number"
          step="0.01"
          min="0"
          disabled={!canEdit}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          onBlur={() => Number(quantity) !== item.quantity && save({ quantity })}
          className="w-16 rounded-lg border border-gray-200 bg-white px-2 py-1 text-right text-sm outline-none focus:border-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <span>x</span>
        <input
          type="number"
          step="0.01"
          min="0"
          disabled={!canEdit}
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          onBlur={() => Number(unitPrice) !== item.unitPrice && save({ unitPrice })}
          className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-1 text-right text-sm outline-none focus:border-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>
      <span className="w-24 text-right font-medium text-gray-800">{formatBaht(item.quantity * item.unitPrice)}</span>
      {canEdit && (
        <button type="button" onClick={handleRemove} className="text-xs text-red-500 hover:underline">
          ลบ
        </button>
      )}
      {saving && <span className="text-xs text-amber-500">กำลังบันทึก...</span>}
    </div>
  );
}

export default function BookingItemsPanel({
  bookingId,
  items,
  menuItems = [],
  minimumOrder,
  requiredStaff,
}: {
  bookingId: string;
  items: BookingItem[];
  menuItems?: MenuItem[];
  minimumOrder: number;
  /** คนขั้นต่ำตามกฎ 75 เสิร์ฟ/คน — เตือนให้คิดค่าพนักงานให้ครบ */
  requiredStaff?: number;
}) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [saving, setSaving] = useState(false);

  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const vat = subtotal * VAT_RATE;
  const grandTotal = subtotal + vat;

  // พิมพ์ชื่อตรงกับรายการในหน้า "จัดการเมนู/ราคา" → เติมราคาตั้งต้นให้ (แก้ได้) ถ้าช่องราคายังว่าง
  function onDescriptionChange(v: string) {
    setDescription(v);
    const hit = menuItems.find((m) => labelOf(m) === v || m.name === v);
    if (hit && hit.unitPrice != null && unitPrice === "") setUnitPrice(String(hit.unitPrice));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!description || unitPrice === "") return;
    const hit = menuItems.find((m) => labelOf(m) === description || m.name === description);
    if (hit?.minPrice != null && Number(unitPrice) < hit.minPrice) {
      setUnitPrice(String(hit.minPrice));
      return;
    }
    setSaving(true);
    await fetch(`/api/catering/bookings/${bookingId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, quantity, unitPrice }),
    });
    setSaving(false);
    setDescription("");
    setQuantity("1");
    setUnitPrice("");
    router.refresh();
    // กรอกรายการถัดไปต่อได้ทันที ไม่ต้องคลิกกลับไปที่ช่องชื่อ
    document.getElementById(`item-desc-${bookingId}`)?.focus();
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">รายการอาหาร / ค่าบริการ</h2>
      <p className="mb-4 text-xs text-gray-400">
        กรอกเองทีละรายการ (ชื่อ · จำนวน · ราคา) กด Enter เพื่อเพิ่มแล้วกรอกรายการถัดไปได้เลย — พิมพ์ชื่อแล้วจะมีรายการจากหน้า &quot;จัดการเมนู/ราคา&quot; ขึ้นมาให้เลือก
        {requiredStaff ? ` · งานนี้ต้องมีพนักงานอย่างน้อย ${requiredStaff} คน (75 เสิร์ฟ/คน) อย่าลืมคิดค่าพนักงานให้ครบ` : ""}
      </p>

      <div className="mb-4 flex flex-col gap-2">
        {items.map((item) => (
          <ItemRow key={item.id} bookingId={bookingId} item={item} />
        ))}
        {items.length === 0 && <p className="text-sm text-gray-400">ยังไม่มีรายการ — ยอดรวมใช้จากช่อง &quot;ยอดรวม&quot; ด้านบน</p>}
      </div>

      {items.length > 0 && (
        <div className="mb-4 flex flex-col gap-1 rounded-lg bg-gray-50 px-4 py-3 text-sm">
          <div className="flex items-center justify-between text-gray-500">
            <span>รวมจากรายการ (ก่อน VAT)</span>
            <span>{formatBaht(subtotal)} บาท</span>
          </div>
          <div className="flex items-center justify-between text-gray-500">
            <span>VAT 7%</span>
            <span>{formatBaht(vat)} บาท</span>
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-gray-200 pt-1 text-base font-bold text-brand-700">
            <span>ยอดสุดท้าย (รวม VAT)</span>
            <span>{formatBaht(grandTotal)} บาท</span>
          </div>
          {subtotal < minimumOrder && (
            <p className="mt-1 text-xs text-amber-700">ยอดก่อน VAT ต่ำกว่าขั้นต่ำ {formatBaht(minimumOrder)} บาท</p>
          )}
        </div>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-gray-300 p-3">
        <div className="min-w-[14rem] flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-500">รายการ</label>
          <input
            id={`item-desc-${bookingId}`}
            list={`menu-suggest-${bookingId}`}
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="เช่น ขนม 3 ชิ้น/เสิร์ฟ, ค่าพนักงาน, ค่าเดินทาง"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white"
          />
          <datalist id={`menu-suggest-${bookingId}`}>
            {menuItems.map((m) => (
              <option key={m.id} value={labelOf(m)}>
                {m.unitPrice != null ? `${formatBaht(m.unitPrice)} บาท` : "ราคากรอกเอง"}
              </option>
            ))}
          </datalist>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">จำนวน</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-20 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">ราคาต่อหน่วย</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            className="w-28 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white"
          />
        </div>
        <button
          type="submit"
          disabled={saving || !description || unitPrice === ""}
          className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          + เพิ่มรายการ
        </button>
      </form>
    </div>
  );
}
