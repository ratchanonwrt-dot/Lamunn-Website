import Link from "next/link";
import { prisma } from "@lamunn/db-catering";
import { requirePageRole } from "@/lib/requirePageRole";
import { formatBaht, formatThaiDate, paymentStatusLabel, bookingStatusLabel, isJobConfirmed } from "@/lib/format";

const PAYMENT_OPTIONS = ["UNPAID", "DEPOSIT_PAID", "FULLY_PAID"] as const;
const STATUS_OPTIONS = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"] as const;

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: { paymentStatus?: string; status?: string; q?: string };
}) {
  await requirePageRole();

  const { paymentStatus, status, q } = searchParams;

  const bookings = await prisma.cateringBooking.findMany({
    where: {
      ...(paymentStatus ? { paymentStatus: paymentStatus as (typeof PAYMENT_OPTIONS)[number] } : {}),
      ...(status ? { status: status as (typeof STATUS_OPTIONS)[number] } : {}),
      ...(q
        ? {
            customer: {
              OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }],
            },
          }
        : {}),
    },
    include: { customer: true, staffAssignments: { include: { staff: { select: { name: true } } } } },
    orderBy: { eventDate: "asc" },
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-800">การจองจัดเลี้ยง ({bookings.length})</h1>
        <Link href="/bookings/new" className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-600/20 hover:bg-brand-700">
          + จองใหม่
        </Link>
      </div>

      <form className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">ค้นหา (ชื่อ/เบอร์โทร)</label>
          <input name="q" defaultValue={q} className="w-48 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 outline-none focus:border-brand-400 focus:bg-white" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">สถานะการชำระเงิน</label>
          <select name="paymentStatus" defaultValue={paymentStatus ?? ""} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 outline-none focus:border-brand-400 focus:bg-white">
            <option value="">ทั้งหมด</option>
            {PAYMENT_OPTIONS.map((p) => (
              <option key={p} value={p}>{paymentStatusLabel[p]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">สถานะการจอง</label>
          <select name="status" defaultValue={status ?? ""} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 outline-none focus:border-brand-400 focus:bg-white">
            <option value="">ทั้งหมด</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{bookingStatusLabel[s]}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-xl border border-gray-200 px-5 py-2.5 text-gray-600 hover:bg-gray-50">
          กรอง
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2">วันงาน</th>
              <th className="px-4 py-2">ลูกค้า</th>
              <th className="px-4 py-2">แพคเกจ</th>
              <th className="px-4 py-2">ยอดรวม</th>
              <th className="px-4 py-2">การชำระเงิน</th>
              <th className="px-4 py-2">สถานะ</th>
              <th className="px-4 py-2">ทีมงาน</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} className={isJobConfirmed(b) ? "border-t border-emerald-100 bg-emerald-50/60" : "border-t border-gray-100"}>
                <td className="px-4 py-2 text-gray-700">{formatThaiDate(b.eventDate)}</td>
                <td className="px-4 py-2">
                  <p className="font-medium text-gray-800">{b.customer.name}</p>
                  <p className="text-xs text-gray-400">{b.customer.phone}</p>
                </td>
                <td className="px-4 py-2 text-gray-500">{b.packageNameSnapshot ?? "-"}</td>
                <td className="px-4 py-2 text-gray-700">{formatBaht(b.totalAmount)}</td>
                <td className="px-4 py-2">
                  <span
                    className={
                      b.paymentStatus === "FULLY_PAID"
                        ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
                        : b.paymentStatus === "DEPOSIT_PAID"
                        ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                        : "rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500"
                    }
                  >
                    {paymentStatusLabel[b.paymentStatus]}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {isJobConfirmed(b) ? (
                    <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs font-bold text-white">✓ คอนเฟิมแล้ว</span>
                  ) : b.status === "CANCELLED" ? (
                    <span className="text-gray-400">{bookingStatusLabel[b.status]}</span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">รอมัดจำ/คอนเฟิม</span>
                  )}
                </td>
                <td className="px-4 py-2 text-gray-500">
                  {b.staffAssignments.length > 0 ? b.staffAssignments.map((a) => a.staff.name).join(", ") : "-"}
                </td>
                <td className="px-4 py-2">
                  <Link href={`/bookings/${b.id}`} className="text-brand-600 hover:underline">
                    ดู/แก้ไข
                  </Link>
                </td>
              </tr>
            ))}
            {bookings.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-gray-400">
                  ไม่พบรายการจอง
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
