import { notFound } from "next/navigation";
import { prisma } from "@lamunn/db-finance";
import { requireSectionPage } from "@/lib/permissions";
import BookingEditForm from "@/components/catering/BookingEditForm";
import BookingStaffPanel from "@/components/catering/BookingStaffPanel";
import BookingBoothPanel from "@/components/catering/BookingBoothPanel";
import BookingItemsPanel from "@/components/catering/BookingItemsPanel";
import BookingDaysPanel from "@/components/catering/BookingDaysPanel";
import DeleteBookingButton from "@/components/catering/DeleteBookingButton";
import PaymentConfirmPanel from "@/components/catering/PaymentConfirmPanel";
import { bookingServings, knownCateringStaffNames, requiredStaff, staffNamesOf } from "@/lib/cateringCalendar";
import EditableBookingCustomer from "@/components/catering/EditableBookingCustomer";
import ReportSection from "@/components/ReportSection";
import { StatusBadge, ChannelTag, StaffCount } from "@/components/catering/StatusBadge";
import { bookingTone, daysAway, TONE } from "@/lib/cateringStatus";
import { bangkokToday } from "@/lib/cateringCalendar";
import { formatBaht, formatThaiDate } from "@/lib/format";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock, MapPin, Users } from "lucide-react";

// แผงย่อยแต่ละตัวมีกรอบ+หัวข้อของตัวเองอยู่แล้ว — พอใส่ในกล่องพับได้ให้ซ่อนกรอบและหัวข้อซ้ำ ไม่งั้นจะเป็นกรอบซ้อนกรอบอ่านยาก
const PLAIN = "[&>*]:!rounded-none [&>*]:!border-0 [&>*]:!bg-transparent [&>*]:!p-0 [&>*]:!shadow-none [&>*>h2:first-child]:hidden";

export default async function BookingDetailPage({ params }: { params: { id: string } }) {
  await requireSectionPage("CATERING");

  const [booking, menuItems, minSettings, knownNames] = await Promise.all([
    prisma.cateringBooking.findUnique({
      where: { id: params.id },
      include: {
        customer: true,
        staffAssignments: { include: { staff: { select: { id: true, name: true } } } },
        items: { orderBy: { sortOrder: "asc" } },
        days: { orderBy: { date: "asc" } },
      },
    }),
    prisma.cateringMenuItem.findMany({ where: { isActive: true }, orderBy: [{ category: "asc" }, { sortOrder: "asc" }] }),
    prisma.setting.findMany({ where: { key: { in: ["cateringMinWithBooth", "cateringMinNoBooth"] } } }),
    knownCateringStaffNames(),
  ]);

  if (!booking) notFound();

  const minMap = Object.fromEntries(minSettings.map((r) => [r.key, r.value]));
  const minimumOrder = booking.needsBooth ? Number(minMap.cateringMinWithBooth ?? 10000) : Number(minMap.cateringMinNoBooth ?? 6000);

  // พนักงานที่ติดงานอื่นในวันเดียวกัน — เตือนในกล่องเลือกพนักงาน กันส่งคนเดียวไปสองงาน
  const lastDay = booking.eventEndDate && booking.eventEndDate > booking.eventDate ? booking.eventEndDate : booking.eventDate;
  const overlapping = await prisma.cateringBooking.findMany({
    where: {
      id: { not: booking.id },
      status: { not: "CANCELLED" },
      eventDate: { lte: lastDay },
      OR: [{ eventEndDate: { gte: booking.eventDate } }, { eventEndDate: null, eventDate: { gte: booking.eventDate } }],
    },
    include: { customer: { select: { name: true, phone: true, source: true } }, staffAssignments: { include: { staff: { select: { name: true } } } } },
  });
  const busyNames: Record<string, string> = {};
  for (const o of overlapping) for (const n of staffNamesOf(o)) busyNames[n.toLowerCase()] = o.customer.name;

  const servings = bookingServings(booking);
  const needStaff = requiredStaff(servings);

  const isMultiDay = booking.eventEndDate && booking.eventEndDate.getTime() > booking.eventDate.getTime();
  const dateLabel = isMultiDay
    ? `${formatThaiDate(booking.eventDate)} – ${formatThaiDate(booking.eventEndDate!)}`
    : formatThaiDate(booking.eventDate);
  const today = bangkokToday();
  const tone = bookingTone(booking, today);
  const time = booking.eventStartTime ? `${booking.eventStartTime}${booking.eventEndTime ? `–${booking.eventEndTime}` : ""} น.` : "ยังไม่ระบุเวลา";
  const itemsTotal = booking.items.reduce((a, i) => a + i.quantity * i.unitPrice, 0);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Link href="/catering/bookings" className="inline-flex w-fit items-center gap-1 text-xs font-medium text-gray-500 hover:text-brand-600">
        <ArrowLeft className="h-3.5 w-3.5" /> งานจัดเลี้ยงทั้งหมด
      </Link>

      {/* หัวการ์ด: ข้อมูลที่ต้องรู้ทันทีเมื่อเปิดงาน */}
      <div className={`rounded-2xl border border-l-4 border-gray-200 bg-white p-5 ${TONE[tone].card}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <EditableBookingCustomer customerId={booking.customer.id} name={booking.customer.name} phone={booking.customer.phone} size="lg" />
              <ChannelTag source={booking.customer.source} />
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge tone={tone} size="lg" />
            <span className="text-xl font-bold text-gray-900">{formatBaht(booking.totalAmount)} ฿</span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
            <CalendarDays className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="min-w-0">
              <span className="block truncate font-medium text-gray-800">{dateLabel}</span>
              <span className="text-[11px] text-gray-400">{daysAway(booking.eventDate, today)}</span>
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
            <Clock className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="font-medium text-gray-800">{time}</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
            <Users className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="font-medium text-gray-800">{servings ? `${servings} เสิร์ฟ` : "ยังไม่ระบุเสิร์ฟ"}</span>
            <StaffCount have={booking.staffAssignments.length} need={needStaff} />
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
            <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="truncate font-medium text-gray-800">{booking.location || "ยังไม่ระบุสถานที่"}</span>
          </div>
        </div>
      </div>

      <PaymentConfirmPanel
        bookingId={booking.id}
        paymentStatus={booking.paymentStatus}
        status={booking.status}
        totalAmount={booking.totalAmount}
        depositAmount={booking.depositAmount}
        paymentDueDate={booking.paymentDueDate?.toISOString() ?? null}
        staffCount={booking.staffAssignments.length}
        requiredStaff={needStaff}
      />

      <BookingStaffPanel bookingId={booking.id} assignments={booking.staffAssignments} knownNames={knownNames} busyNames={busyNames} servings={servings} required={needStaff} />

      <div>
        <ReportSection title="แก้ไขรายละเอียดงาน" summary="วันที่ เวลา สถานที่ จำนวนเสิร์ฟ ยอดเงิน สถานะ หมายเหตุ">
          <div className={PLAIN}>
            <BookingEditForm
              key={booking.totalAmount}
              booking={{
                ...booking,
                eventDate: booking.eventDate.toISOString(),
                eventEndDate: booking.eventEndDate?.toISOString() ?? null,
                depositPaidAt: booking.depositPaidAt?.toISOString() ?? null,
                balancePaidAt: booking.balancePaidAt?.toISOString() ?? null,
                paymentDueDate: booking.paymentDueDate?.toISOString() ?? null,
              }}
              hasItems={booking.items.length > 0}
            />
          </div>
        </ReportSection>

        <ReportSection
          title="รายการอาหาร / ค่าบริการ"
          summary={booking.items.length ? `${booking.items.length} รายการ · ${formatBaht(itemsTotal * 1.07)} บาท (รวม VAT)` : "ยังไม่มีรายการ — กรอกทีละรายการ"}
        >
          <div className={PLAIN}>
            <BookingItemsPanel bookingId={booking.id} items={booking.items} menuItems={menuItems} minimumOrder={minimumOrder} requiredStaff={needStaff} />
          </div>
        </ReportSection>

        {booking.days.length > 0 && (
          <ReportSection title="รายละเอียดแต่ละวัน" summary={`งานต่อเนื่อง ${booking.days.length} วัน — จำนวนเสิร์ฟ/โน้ตแยกวัน`}>
            <div className={PLAIN}>
              <BookingDaysPanel bookingId={booking.id} days={booking.days.map((d) => ({ ...d, date: d.date.toISOString() }))} />
            </div>
          </ReportSection>
        )}

        <ReportSection title="บูธ / ความต้องการพิเศษ" summary={booking.needsBooth ? "มีบูธ" : "ไม่มีบูธ"}>
          <div className={PLAIN}>
            <BookingBoothPanel bookingId={booking.id} needsBooth={booking.needsBooth} specialRequest={booking.specialRequest} />
          </div>
        </ReportSection>
      </div>

      <div className="flex justify-end">
        <DeleteBookingButton id={booking.id} redirectAfter />
      </div>
    </div>
  );
}
