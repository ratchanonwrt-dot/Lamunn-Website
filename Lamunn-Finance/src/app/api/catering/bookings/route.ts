import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { syncCateringBookingDays } from "@/lib/cateringBookingDays";

export async function POST(req: NextRequest) {
  const staff = await requireSectionApi("CATERING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    phone,
    customerName,
    source,
    eventDate,
    eventEndDate,
    eventStartTime,
    eventEndTime,
    location,
    guestCount,
    totalAmount,
    depositAmount,
    paymentStatus,
    paymentDueDate,
  } = body;

  if (!phone || !customerName || !eventDate || totalAmount === undefined) {
    return NextResponse.json({ error: "phone, customerName, eventDate, totalAmount are required" }, { status: 400 });
  }

  const PAYMENT_STATUSES = ["UNPAID", "DEPOSIT_PAID", "FULLY_PAID"] as const;
  type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
  const status: PaymentStatus = PAYMENT_STATUSES.includes(paymentStatus) ? paymentStatus : depositAmount ? "DEPOSIT_PAID" : "UNPAID";

  const customer = await prisma.customer.upsert({
    where: { phone },
    update: { name: customerName, ...(source ? { source } : {}) },
    create: { phone, name: customerName, source: source || null },
  });

  const booking = await prisma.cateringBooking.create({
    data: {
      customerId: customer.id,
      eventDate: new Date(eventDate),
      eventEndDate: eventEndDate ? new Date(eventEndDate) : null,
      eventStartTime: eventStartTime || null,
      eventEndTime: eventEndTime || null,
      location: location || null,
      guestCount: guestCount ? Number(guestCount) : null,
      totalAmount: Number(totalAmount),
      depositAmount: depositAmount ? Number(depositAmount) : null,
      // พนักงานเลือกสถานะเองตอนลงงาน (จอง / มัดจำแล้ว / จ่ายเต็ม) — ถ้าไม่ส่งมา เดาจากยอดมัดจำแบบเดิม
      paymentStatus: status,
      depositPaidAt: status !== "UNPAID" ? new Date() : null,
      balancePaidAt: status === "FULLY_PAID" ? new Date() : null,
      // จ่ายเต็มแล้ว = ลูกค้ายืนยันงานแล้ว ไม่ต้องให้พนักงานไปกดยืนยันซ้ำ
      status: status === "FULLY_PAID" ? "CONFIRMED" : "PENDING",
      paymentDueDate: paymentDueDate ? new Date(paymentDueDate) : null,
      createdByStaffId: staff.staffId,
    },
  });
  await syncCateringBookingDays(booking.id, booking.eventDate, booking.eventEndDate);

  return NextResponse.json({ booking });
}
