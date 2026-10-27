"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatBaht, formatThaiDate } from "@/lib/format";

/** กล่องบนสุดของหน้างาน: สถานะเงิน + ปุ่ม "รับเงินแล้ว + ยืนยันงาน" กดครั้งเดียวจบ
 * (ดูเหตุผลใน api/catering/bookings/[id]/confirm-payment) */
export default function PaymentConfirmPanel({
  bookingId,
  paymentStatus,
  status,
  totalAmount,
  depositAmount,
  paymentDueDate,
  staffCount,
  requiredStaff = 1,
}: {
  bookingId: string;
  paymentStatus: string;
  status: string;
  totalAmount: number;
  depositAmount: number | null;
  paymentDueDate: string | null;
  staffCount: number;
  requiredStaff?: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"DEPOSIT" | "FULL" | null>(null);
  const [deposit, setDeposit] = useState(depositAmount != null ? String(depositAmount) : "");
  const [error, setError] = useState<string | null>(null);

  async function confirm(kind: "DEPOSIT" | "FULL") {
    setBusy(kind);
    setError(null);
    const res = await fetch(`/api/catering/bookings/${bookingId}/confirm-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, ...(kind === "DEPOSIT" && deposit ? { depositAmount: deposit } : {}) }),
    });
    setBusy(null);
    if (!res.ok) {
      setError("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
      return;
    }
    router.refresh();
  }

  const todayIso = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const due = paymentDueDate ? paymentDueDate.slice(0, 10) : null;
  const overdue = due && paymentStatus !== "FULLY_PAID" && due < todayIso;
  const tone =
    paymentStatus === "FULLY_PAID" ? "border-emerald-200 bg-emerald-50" : paymentStatus === "DEPOSIT_PAID" ? "border-sky-200 bg-sky-50" : "border-amber-200 bg-amber-50";
  const statusText = paymentStatus === "FULLY_PAID" ? "จ่ายเต็มแล้ว" : paymentStatus === "DEPOSIT_PAID" ? "มัดจำแล้ว" : "จอง (ยังไม่จ่าย)";

  return (
    <div className={`rounded-xl border p-5 ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-gray-500">สถานะ</p>
          <p className="text-lg font-bold text-gray-800">
            {statusText}
            {status === "CONFIRMED" && <span className="ml-2 rounded-full bg-emerald-600 px-2 py-0.5 align-middle text-[11px] font-medium text-white">ยืนยันงานแล้ว</span>}
            {status === "COMPLETED" && <span className="ml-2 rounded-full bg-gray-600 px-2 py-0.5 align-middle text-[11px] font-medium text-white">จบงานแล้ว</span>}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            ยอดรวม {formatBaht(totalAmount)} บาท
            {depositAmount ? ` · มัดจำ ${formatBaht(depositAmount)}` : ""}
            {due && paymentStatus !== "FULLY_PAID" && (
              <span className={overdue ? "font-semibold text-red-600" : ""}>
                {" · "}ครบกำหนดจ่าย {formatThaiDate(new Date(`${due}T00:00:00Z`))}
                {overdue ? " (เลยกำหนดแล้ว)" : ""}
              </span>
            )}
          </p>
          {status === "CONFIRMED" && staffCount < requiredStaff && (
            <p className="mt-1 text-xs font-medium text-red-600">
              ยืนยันแล้วแต่พนักงานยังไม่พอ ({staffCount}/{requiredStaff} คน) — เลือกด้านล่าง
            </p>
          )}
        </div>

        {paymentStatus !== "FULLY_PAID" && (
          <div className="flex flex-wrap items-end gap-2">
            {paymentStatus === "UNPAID" && (
              <>
                <label className="flex flex-col gap-1 text-xs text-gray-500">
                  ยอดมัดจำที่ได้รับ
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={deposit}
                    onChange={(e) => setDeposit(e.target.value)}
                    className="w-32 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-right text-sm"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => confirm("DEPOSIT")}
                  disabled={busy !== null}
                  className="rounded-xl border border-sky-300 bg-white px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                >
                  {busy === "DEPOSIT" ? "กำลังบันทึก..." : "รับมัดจำแล้ว + ยืนยันงาน"}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => confirm("FULL")}
              disabled={busy !== null}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy === "FULL" ? "กำลังบันทึก..." : "รับเงินครบแล้ว + ยืนยันงาน"}
            </button>
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
