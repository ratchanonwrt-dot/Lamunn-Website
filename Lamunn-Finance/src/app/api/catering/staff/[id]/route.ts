import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { parseDayOffs } from "@/lib/cateringStaffPay";
import { logActivity } from "@/lib/activityLog";

/** แก้ข้อมูลพนักงาน Catering — เปลี่ยนชื่อแล้วแก้ชื่อในงานที่เคยจัดไว้ด้วย ไม่งั้น OT ของงานเก่าจะหลุดจากคนนี้ */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireSectionApi("CATERING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const existing = await prisma.cateringStaff.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "กรอกชื่อพนักงาน" }, { status: 400 });
    const dup = await prisma.cateringStaff.findFirst({ where: { id: { not: existing.id }, name: { equals: name, mode: "insensitive" } } });
    if (dup) return NextResponse.json({ error: `มีชื่อ "${dup.name}" อยู่แล้ว` }, { status: 409 });
    data.name = name;
  }
  if (body.dayOffs !== undefined) data.dayOffs = parseDayOffs(body.dayOffs).join(",");
  if (body.otRatePerHour !== undefined) data.otRatePerHour = Math.max(0, Number(body.otRatePerHour) || 0);
  if (body.dayOffRatePerHour !== undefined) data.dayOffRatePerHour = body.dayOffRatePerHour === "" || body.dayOffRatePerHour == null ? null : Math.max(0, Number(body.dayOffRatePerHour) || 0);
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  if (body.note !== undefined) data.note = body.note ? String(body.note) : null;

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.cateringStaff.update({ where: { id: existing.id }, data });
    if (data.name && data.name !== existing.name) {
      await tx.cateringBookingStaff.updateMany({ where: { staffName: { equals: existing.name, mode: "insensitive" } }, data: { staffName: data.name as string } });
    }
    return u;
  });
  return NextResponse.json({ staff: updated });
}

/** ลบออกจากรายชื่อ — ประวัติการไปงานยังอยู่ (ชื่อในงานไม่ถูกลบ) แค่จะไม่มีอัตรา OT ให้คิด */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireSectionApi("CATERING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const existing = await prisma.cateringStaff.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ ok: true });
  await prisma.cateringStaff.delete({ where: { id: params.id } });
  await logActivity({ staffId: staff.staffId, staffName: staff.staffName, action: "DELETE", entity: "CateringStaff", summary: `ลบพนักงาน Catering ออกจากรายชื่อ — ${existing.name}` });
  return NextResponse.json({ ok: true });
}
