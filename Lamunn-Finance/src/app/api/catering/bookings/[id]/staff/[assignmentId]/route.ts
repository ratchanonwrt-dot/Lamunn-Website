import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";

/** ว่าง/null = ล้างค่า (ชั่วโมงกลับไปคิดจากเวลางาน, ค่ารถ = ไม่มี) — undefined = ไม่ได้ส่งมา ไม่แตะค่าเดิม */
function parseOptional(raw: unknown, max: number): number | null | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (raw === "" || raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : "invalid";
}

/** แก้ชั่วโมง OT และ/หรือค่ารถล่วงหน้าของการไปงานครั้งนี้ — ช่องในหน้างานบันทึกทีละช่อง จึงรับเฉพาะ field ที่ส่งมา */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; assignmentId: string } }) {
  const staff = await requireSectionApi("CATERING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const otHours = parseOptional(body.otHours, 500);
  const travelCost = parseOptional(body.travelCost, 100000);
  if (otHours === "invalid") return NextResponse.json({ error: "otHours must be 0-500" }, { status: 400 });
  if (travelCost === "invalid") return NextResponse.json({ error: "travelCost must be 0-100000" }, { status: 400 });

  const assignment = await prisma.cateringBookingStaff.update({
    where: { id: params.assignmentId, bookingId: params.id },
    data: { otHours, travelCost },
  });
  return NextResponse.json({ assignment });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; assignmentId: string } }) {
  const staff = await requireSectionApi("CATERING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await prisma.cateringBookingStaff.delete({ where: { id: params.assignmentId } });
  return NextResponse.json({ ok: true });
}
