"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toDateInputValue } from "@/lib/format";
import DateSelect from "./DateSelect";
import TimeSelect from "./TimeSelect";

interface BookingData {
  id: string;
  eventDate: string;
  eventEndDate: string | null;
  eventStartTime: string | null;
  eventEndTime: string | null;
  location: string | null;
  guestCount: number | null;
  totalAmount: number;
  depositAmount: number | null;
  depositPaidAt: string | null;
  balancePaidAt: string | null;
  paymentStatus: string;
  status: string;
  note: string | null;
  paymentDueDate: string | null;
}

const PAYMENT_OPTIONS = [
  { value: "UNPAID", label: "จอง (ยังไม่จ่าย)" },
  { value: "DEPOSIT_PAID", label: "มัดจำแล้ว" },
  { value: "FULLY_PAID", label: "จ่ายเต็มแล้ว" },
];

const STATUS_OPTIONS = [
  { value: "PENDING", label: "รอยืนยัน" },
  { value: "CONFIRMED", label: "ยืนยันแล้ว" },
  { value: "COMPLETED", label: "จบงานแล้ว" },
  { value: "CANCELLED", label: "ยกเลิก" },
];

export default function BookingEditForm({ booking, hasItems = false }: { booking: BookingData; hasItems?: boolean }) {
  const router = useRouter();
  const [eventDate, setEventDate] = useState(toDateInputValue(new Date(booking.eventDate)));
  const [eventEndDate, setEventEndDate] = useState(booking.eventEndDate ? toDateInputValue(new Date(booking.eventEndDate)) : "");
  const [eventStartTime, setEventStartTime] = useState(booking.eventStartTime ?? "");
  const [eventEndTime, setEventEndTime] = useState(booking.eventEndTime ?? "");
  const [location, setLocation] = useState(booking.location ?? "");
  const [guestCount, setGuestCount] = useState(booking.guestCount != null ? String(booking.guestCount) : "");
  const [totalAmount, setTotalAmount] = useState(String(booking.totalAmount));
  const [depositAmount, setDepositAmount] = useState(booking.depositAmount != null ? String(booking.depositAmount) : "");
  const [paymentStatus, setPaymentStatus] = useState(booking.paymentStatus);
  const [status, setStatus] = useState(booking.status);
  const [note, setNote] = useState(booking.note ?? "");
  const [paymentDueDate, setPaymentDueDate] = useState(booking.paymentDueDate ? toDateInputValue(new Date(booking.paymentDueDate)) : "");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const depositPaidAt = paymentStatus !== "UNPAID" && !booking.depositPaidAt ? new Date().toISOString() : undefined;
    const balancePaidAt = paymentStatus === "FULLY_PAID" && !booking.balancePaidAt ? new Date().toISOString() : undefined;

    const res = await fetch(`/api/catering/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventDate,
        eventEndDate: eventEndDate || null,
        eventStartTime,
        eventEndTime,
        location,
        guestCount: guestCount || null,
        totalAmount,
        depositAmount: depositAmount || null,
        paymentStatus,
        status,
        note,
        paymentDueDate: paymentDueDate || null,
        ...(depositPaidAt ? { depositPaidAt } : {}),
        ...(balancePaidAt ? { balancePaidAt } : {}),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("บันทึกไม่สำเร็จ");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold text-gray-700">รายละเอียดงาน / การชำระเงิน</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">วันจัดงาน</label>
          <DateSelect required value={eventDate} onChange={setEventDate} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">ถึงวันที่ (ถ้าจัดต่อกันหลายวัน)</label>
          <DateSelect value={eventEndDate} onChange={setEventEndDate} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">เวลาเริ่ม</label>
          <TimeSelect value={eventStartTime} onChange={setEventStartTime} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">เวลาสิ้นสุด</label>
          <TimeSelect value={eventEndTime} onChange={setEventEndTime} />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-500">สถานที่จัดงาน</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">จำนวนเสิร์ฟ</label>
          <input type="number" min="0" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white" />
        </div>

        <div>
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500">
            ยอดรวม (บาท)
            {hasItems && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-normal text-brand-600">คำนวณจากรายการด้านล่าง (รวม VAT 7% แล้ว)</span>}
          </label>
          <input
            required
            type="number"
            step="0.01"
            min="0"
            value={totalAmount}
            disabled={hasItems}
            onChange={(e) => setTotalAmount(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">ยอดมัดจำ (บาท)</label>
          <input type="number" step="0.01" min="0" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">สถานะการชำระเงิน</label>
          <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white">
            {PAYMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">ครบกำหนดจ่ายวันที่</label>
          <DateSelect value={paymentDueDate} onChange={setPaymentDueDate} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">สถานะการจอง</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white">
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-500">หมายเหตุ</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white" />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {saved && <p className="mt-3 text-sm text-emerald-600">บันทึกแล้ว</p>}
      <button type="submit" disabled={saving} className="mt-4 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-600/20 hover:bg-brand-700 disabled:opacity-50">
        {saving ? "กำลังบันทึก..." : "บันทึก"}
      </button>
    </form>
  );
}
