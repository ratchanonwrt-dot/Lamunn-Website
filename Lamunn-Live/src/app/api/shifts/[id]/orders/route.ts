import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@lamunn/db-live";
import { requireStaff, RECORDER_ROLES } from "@/lib/requireStaff";

/**
 * กรอกออเดอร์ของกะ (แทนที่ของเดิมทั้งหมด)
 * body: { orderCount: number|null, shippingCost: number|null, lines: [{ productId, quantity }] }
 * ต้นทุนต่อชุด: บรรทัดสินค้าที่มีอยู่แล้วคงต้นทุนเดิมไว้ บรรทัดใหม่ใช้ต้นทุนปัจจุบันของสินค้า
 * ส่งทุกช่องว่าง = ล้างออเดอร์ กลับไปใช้ % ประมาณ
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireStaff(RECORDER_ROLES);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  const shift = await prisma.liveShift.findUnique({ where: { id: params.id }, include: { orderLines: true } });
  if (!shift) return NextResponse.json({ error: "ไม่พบกะ" }, { status: 404 });

  const optNum = (v: unknown, label: string, int: boolean): { ok: true; value: number | null } | { ok: false; error: string } => {
    if (v === null || v === undefined || v === "") return { ok: true, value: null };
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || (int && !Number.isInteger(n))) return { ok: false, error: `${label} ต้องเป็น${int ? "จำนวนเต็ม" : "ตัวเลข"} 0 ขึ้นไป` };
    return { ok: true, value: n };
  };
  const oc = optNum(body.orderCount, "จำนวนออเดอร์", true);
  if (!oc.ok) return NextResponse.json({ error: oc.error }, { status: 400 });
  const sc = optNum(body.shippingCost, "ค่าส่ง", false);
  if (!sc.ok) return NextResponse.json({ error: sc.error }, { status: 400 });

  const rawLines: { productId?: unknown; quantity?: unknown }[] = Array.isArray(body.lines) ? body.lines : [];
  const wanted = new Map<string, number>();
  for (const [i, l] of rawLines.entries()) {
    if (!l.productId && (l.quantity === "" || l.quantity === undefined || l.quantity === null)) continue; // แถวว่าง
    const pid = typeof l.productId === "string" ? l.productId : "";
    const q = Number(l.quantity);
    if (!pid) return NextResponse.json({ error: `แถวที่ ${i + 1}: เลือกสินค้า` }, { status: 400 });
    if (!Number.isInteger(q) || q <= 0) return NextResponse.json({ error: `แถวที่ ${i + 1}: จำนวนชุดต้องเป็นจำนวนเต็มมากกว่า 0` }, { status: 400 });
    // สินค้าเดียวกันหลายแถวรวมเป็นแถวเดียว
    wanted.set(pid, (wanted.get(pid) ?? 0) + q);
  }
  const products = wanted.size ? await prisma.liveProduct.findMany({ where: { id: { in: [...wanted.keys()] } } }) : [];
  if (products.length !== wanted.size) return NextResponse.json({ error: "มีสินค้าที่ไม่พบในรายการ" }, { status: 400 });

  const oldCost = new Map(shift.orderLines.filter((l) => l.productId).map((l) => [l.productId!, l.unitCost]));
  const lines = products.map((p) => ({ shiftId: shift.id, productId: p.id, productName: p.name, quantity: wanted.get(p.id)!, unitCost: oldCost.get(p.id) ?? p.costPerSet }));

  await prisma.$transaction([
    // บรรทัดของสินค้าที่ถูกลบจากรายการไปแล้ว (productId ว่าง) แก้จากหน้าจอไม่ได้ จึงเก็บไว้ตามเดิม
    prisma.shiftOrderLine.deleteMany({ where: { shiftId: shift.id, productId: { not: null } } }),
    ...(lines.length ? [prisma.shiftOrderLine.createMany({ data: lines })] : []),
    prisma.liveShift.update({ where: { id: shift.id }, data: { orderCount: oc.value, shippingCost: sc.value } }),
  ]);
  const saved = await prisma.liveShift.findUniqueOrThrow({ where: { id: shift.id }, select: { orderCount: true, shippingCost: true, orderLines: true } });
  return NextResponse.json({ ok: true, ...saved });
}
