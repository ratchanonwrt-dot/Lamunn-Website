import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLog";
import { formatThaiDate } from "@/lib/format";

/** ปุ่มเดียวหลังลูกค้าโอนเงิน: บันทึกว่ารับเงินแล้ว (มัดจำ หรือ เต็มจำนวน) + ยืนยันงานลงตาราง
 *
 * เดิมพนักงานต้องเปลี่ยน 2 ช่อง (สถานะการชำระ + สถานะการจอง) แล้วกดบันทึกเอง — ลืมเปลี่ยนช่องใดช่องหนึ่งบ่อย
 * งานที่รับเงินแล้วแต่ยังขึ้น "รอยืนยัน" ทำให้ปฏิทินดูเหมือนยังไม่แน่นอน */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireSectionApi("CATERING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { kind, depositAmount } = await req.json().catch(() => ({}));
  if (kind !== "DEPOSIT" && kind !== "FULL") return NextResponse.json({ error: "kind must be DEPOSIT or FULL" }, { status: 400 });

  const existing = await prisma.cateringBooking.findUnique({ where: { id: params.id }, include: { customer: { select: { name: true } } } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const now = new Date();
  const deposit = depositAmount === undefined || depositAmount === "" ? undefined : Number(depositAmount);
  const booking = await prisma.cateringBooking.update({
    where: { id: params.id },
    data: {
      paymentStatus: kind === "FULL" ? "FULLY_PAID" : "DEPOSIT_PAID",
      depositPaidAt: existing.depositPaidAt ?? now,
      ...(kind === "FULL" ? { balancePaidAt: existing.balancePaidAt ?? now } : {}),
      ...(deposit !== undefined && Number.isFinite(deposit) ? { depositAmount: deposit } : {}),
      // งานที่จบแล้วคงสถานะไว้ ไม่ย้อนกลับเป็น "ยืนยันแล้ว"
      ...(existing.status === "COMPLETED" ? {} : { status: "CONFIRMED" }),
    },
  });

  await logActivity({
    staffId: staff.staffId,
    staffName: staff.staffName,
    action: "UPDATE",
    entity: "CateringBooking",
    summary: `รับเงิน${kind === "FULL" ? "เต็มจำนวน" : "มัดจำ"} + ยืนยันงาน — ${existing.customer.name} (${formatThaiDate(existing.eventDate)})`,
  });

  return NextResponse.json({ booking });
}
