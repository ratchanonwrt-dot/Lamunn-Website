import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@lamunn/db-live";
import { requireStaff, EDITOR_ROLES } from "@/lib/requireStaff";

/**
 * แก้สินค้า — body: { name?, costPerSet?, isActive? }
 * แก้ต้นทุนแล้วมีผลกับออเดอร์ที่กรอก "หลังจากนี้" เท่านั้น ออเดอร์เก่าเก็บต้นทุน ณ ตอนกรอกไว้แล้ว
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireStaff(EDITOR_ROLES);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const data: { name?: string; costPerSet?: number; isActive?: boolean } = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "กรุณาระบุชื่อสินค้า/ชุด" }, { status: 400 });
    data.name = name;
  }
  if (body.costPerSet !== undefined) {
    const cost = Number(body.costPerSet);
    if (!Number.isFinite(cost) || cost < 0) return NextResponse.json({ error: "ต้นทุนต่อชุดต้องเป็นตัวเลข 0 ขึ้นไป" }, { status: 400 });
    data.costPerSet = cost;
  }
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  const product = await prisma.liveProduct.update({ where: { id: params.id }, data });
  return NextResponse.json({ product });
}

/** ลบได้เฉพาะสินค้าที่ยังไม่เคยถูกกรอกในออเดอร์ — ที่เคยใช้แล้วให้ปิดใช้งานแทน */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireStaff(EDITOR_ROLES);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const used = await prisma.shiftOrderLine.count({ where: { productId: params.id } });
  if (used > 0) return NextResponse.json({ error: "สินค้านี้มีในออเดอร์แล้ว ลบไม่ได้ — ให้ปิดใช้งานแทน" }, { status: 400 });
  await prisma.liveProduct.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
