import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";

/** แก้ชั่วโมง OT ของการไปงานครั้งนี้ — ว่าง/null = กลับไปคิดจากเวลางานอัตโนมัติ */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; assignmentId: string } }) {
  const staff = await requireSectionApi("CATERING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const raw = body.otHours;
  const otHours = raw === "" || raw === null || raw === undefined ? null : Number(raw);
  if (otHours !== null && (!Number.isFinite(otHours) || otHours < 0 || otHours > 500)) {
    return NextResponse.json({ error: "otHours must be 0-500" }, { status: 400 });
  }
  const assignment = await prisma.cateringBookingStaff.update({
    where: { id: params.assignmentId, bookingId: params.id },
    data: { otHours },
  });
  return NextResponse.json({ assignment });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; assignmentId: string } }) {
  const staff = await requireSectionApi("CATERING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await prisma.cateringBookingStaff.delete({ where: { id: params.assignmentId } });
  return NextResponse.json({ ok: true });
}
