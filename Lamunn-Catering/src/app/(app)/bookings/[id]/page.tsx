import { notFound } from "next/navigation";
import { prisma } from "@lamunn/db-catering";
import { requirePageRole } from "@/lib/requirePageRole";
import BookingEditForm from "@/components/BookingEditForm";
import BookingStaffPanel from "@/components/BookingStaffPanel";
import BookingChecklistPanel from "@/components/BookingChecklistPanel";
import BookingConfirmBanner from "@/components/BookingConfirmBanner";
import { formatThaiDate, customerSourceLabel, isJobConfirmed } from "@/lib/format";

export default async function BookingDetailPage({ params }: { params: { id: string } }) {
  await requirePageRole();

  const [booking, staffOptions] = await Promise.all([
    prisma.cateringBooking.findUnique({
      where: { id: params.id },
      include: {
        customer: true,
        staffAssignments: { include: { staff: { select: { id: true, name: true } } } },
        checklistItems: { orderBy: { sortOrder: "asc" } },
      },
    }),
    prisma.staffUser.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  if (!booking) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">
          {booking.customer.name} — {formatThaiDate(booking.eventDate)}
        </h1>
        <p className="text-sm text-gray-500">
          โทร {booking.customer.phone}
          {booking.customer.source ? ` · ${customerSourceLabel[booking.customer.source] ?? booking.customer.source}` : ""}
        </p>
      </div>

      {booking.status !== "CANCELLED" && (
        <BookingConfirmBanner
          bookingId={booking.id}
          confirmed={isJobConfirmed(booking)}
          paymentStatus={booking.paymentStatus}
          totalAmount={booking.totalAmount}
          depositAmount={booking.depositAmount}
        />
      )}

      <BookingEditForm
        // key เปลี่ยนเมื่อปุ่มคอนเฟิมแก้สถานะ → ฟอร์มรีเซ็ตค่าตามข้อมูลใหม่ ไม่งั้นกดบันทึกแล้วค่าเก่าจะทับ
        key={`${booking.status}-${booking.paymentStatus}-${booking.depositAmount}`}
        booking={{
          ...booking,
          eventDate: booking.eventDate.toISOString(),
          depositPaidAt: booking.depositPaidAt?.toISOString() ?? null,
          balancePaidAt: booking.balancePaidAt?.toISOString() ?? null,
        }}
      />

      <BookingStaffPanel bookingId={booking.id} assignments={booking.staffAssignments} staffOptions={staffOptions} />

      <BookingChecklistPanel bookingId={booking.id} items={booking.checklistItems} />
    </div>
  );
}
