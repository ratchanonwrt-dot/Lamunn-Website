"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock } from "lucide-react";
import { formatBaht } from "@/lib/format";
import { useCanEdit } from "@/lib/RoleContext";

// ปุ่มเด่นสำหรับ "มัดจำแล้ว คอนเฟิมงาน" — ยังไม่คอนเฟิม = ส้ม, คอนเฟิมแล้ว = เขียว
// กดครั้งเดียวตั้งทั้งสถานะการจอง (ยืนยันแล้ว) และการชำระเงิน (มัดจำแล้ว) ให้พร้อมกัน ไม่ต้องไปแก้ 2 dropdown
export default function BookingConfirmBanner({
  bookingId,
  confirmed,
  paymentStatus,
  totalAmount,
  depositAmount,
}: {
  bookingId: string;
  confirmed: boolean;
  paymentStatus: string;
  totalAmount: number;
  depositAmount: number | null;
}) {
  const router = useRouter();
  const canEdit = useCanEdit();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(data: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/bookings/${bookingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSaving(false);
    if (!res.ok) {
      setError("บันทึกไม่สำเร็จ");
      return;
    }
    router.refresh();
  }

  function handleConfirm() {
    // ถ้ายังไม่เคยกรอกยอดมัดจำ ใช้ 50% ของยอดรวมเป็นค่าเริ่มต้น (แก้ได้ในฟอร์มด้านล่าง)
    const deposit = depositAmount ?? Math.round(totalAmount / 2);
    // ถ้าจ่ายครบแล้วอยู่ก่อน ไม่ถอยสถานะลงเป็น "มัดจำ"
    const keepPayment = paymentStatus === "FULLY_PAID" ? {} : { paymentStatus: "DEPOSIT_PAID" };
    patch({ status: "CONFIRMED", depositAmount: deposit, depositPaidAt: new Date().toISOString(), ...keepPayment });
  }

  function handleUndo() {
    if (!confirm("ยกเลิกการคอนเฟิม? งานจะกลับเป็น 'รอยืนยัน / ยังไม่ชำระ'")) return;
    patch({ status: "PENDING", paymentStatus: "UNPAID", depositPaidAt: null, balancePaidAt: null });
  }

  if (confirmed) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-emerald-500 bg-emerald-500 px-5 py-4 text-white shadow-lg shadow-emerald-600/20">
        <div className="flex items-center gap-3">
          <CheckCircle2 size={32} strokeWidth={2.4} />
          <div>
            <p className="text-lg font-bold">มัดจำแล้ว — คอนเฟิมงานแล้ว</p>
            <p className="text-sm text-emerald-50">
              {paymentStatus === "FULLY_PAID" ? "ชำระครบแล้ว" : `มัดจำ ${formatBaht(depositAmount)} จาก ${formatBaht(totalAmount)} บาท`}
            </p>
          </div>
        </div>
        {canEdit && (
          <button onClick={handleUndo} disabled={saving} className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium hover:bg-white/30 disabled:opacity-50">
            ยกเลิกการคอนเฟิม
          </button>
        )}
        {error && <p className="w-full text-sm">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 px-5 py-4">
      <div className="flex items-center gap-3">
        <Clock size={32} strokeWidth={2.4} className="text-amber-500" />
        <div>
          <p className="text-lg font-bold text-amber-800">ยังไม่คอนเฟิมงาน</p>
          <p className="text-sm text-amber-700">รอลูกค้าโอนมัดจำ — กดปุ่มเมื่อได้รับมัดจำแล้ว</p>
        </div>
      </div>
      {canEdit && (
        <button
          onClick={handleConfirm}
          disabled={saving}
          className="rounded-xl bg-amber-500 px-6 py-3 text-base font-bold text-white shadow-md shadow-amber-500/30 transition hover:bg-amber-600 disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก..." : "✓ มัดจำแล้ว คอนเฟิมงาน"}
        </button>
      )}
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </div>
  );
}
