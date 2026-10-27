import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { syncCateringBookingDays } from "@/lib/cateringBookingDays";
import { logActivity } from "@/lib/activityLog";
import { formatThaiDate } from "@/lib/format";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireSectionApi("CATERING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    eventDate,
    eventEndDate,
    eventStartTime,
    eventEndTime,
    location,
    guestCount,
    totalAmount,
    depositAmount,
    depositPaidAt,
    balancePaidAt,
    paymentStatus,
    status,
    note,
    needsBooth,
    specialRequest,
    paymentDueDate,
  } = body;

  const booking = await prisma.cateringBooking.update({
    where: { id: params.id },
    data: {
      ...(eventDate !== undefined ? { eventDate: new Date(eventDate) } : {}),
      ...(eventEndDate !== undefined ? { eventEndDate: eventEndDate ? new Date(eventEndDate) : null } : {}),
      ...(eventStartTime !== undefined ? { eventStartTime: eventStartTime || null } : {}),
      ...(eventEndTime !== undefined ? { eventEndTime: eventEndTime || null } : {}),
      ...(location !== undefined ? { location: location || null } : {}),
      ...(guestCount !== undefined ? { guestCount: guestCount ? Number(guestCount) : null } : {}),
      ...(totalAmount !== undefined ? { totalAmount: Number(totalAmount) } : {}),
      ...(depositAmount !== undefined ? { depositAmount: depositAmount === null ? null : Number(depositAmount) } : {}),
      ...(depositPaidAt !== undefined ? { depositPaidAt: depositPaidAt ? new Date(depositPaidAt) : null } : {}),
      ...(balancePaidAt !== undefined ? { balancePaidAt: balancePaidAt ? new Date(balancePaidAt) : null } : {}),
      ...(paymentStatus !== undefined ? { paymentStatus } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(note !== undefined ? { note: note || null } : {}),
      ...(needsBooth !== undefined ? { needsBooth: Boolean(needsBooth) } : {}),
      ...(specialRequest !== undefined ? { specialRequest: specialRequest || null } : {}),
      ...(paymentDueDate !== undefined ? { paymentDueDate: paymentDueDate ? new Date(paymentDueDate) : null } : {}),
    },
  });
  if (eventDate !== undefined || eventEndDate !== undefined) {
    await syncCateringBookingDays(booking.id, booking.eventDate, booking.eventEndDate);
  }

  return NextResponse.json({ booking });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireSectionApi("CATERING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const existing = await prisma.cateringBooking.findUnique({ where: { id: params.id }, include: { customer: true } });
  await prisma.cateringBooking.delete({ where: { id: params.id } });
  if (existing) {
    await logActivity({
      staffId: staff.staffId,
      staffName: staff.staffName,
      action: "DELETE",
      entity: "CateringBooking",
      summary: `ลบการจองจัดเลี้ยง — ${existing.customer.name} (${formatThaiDate(existing.eventDate)})`,
    });
  }
  return NextResponse.json({ ok: true });
}
