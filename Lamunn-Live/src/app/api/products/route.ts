import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@lamunn/db-live";
import { requireStaff, EDITOR_ROLES } from "@/lib/requireStaff";

export async function GET() {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const products = await prisma.liveProduct.findMany({ orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }] });
  return NextResponse.json({ products });
}

/** เพิ่มสินค้า/ชุด — body: { name, costPerSet } */
export async function POST(req: NextRequest) {
  const staff = await requireStaff(EDITOR_ROLES);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const cost = Number(body.costPerSet);
  if (!name) return NextResponse.json({ error: "กรุณาระบุชื่อสินค้า/ชุด" }, { status: 400 });
  if (!Number.isFinite(cost) || cost < 0) return NextResponse.json({ error: "ต้นทุนต่อชุดต้องเป็นตัวเลข 0 ขึ้นไป" }, { status: 400 });
  const product = await prisma.liveProduct.create({ data: { name, costPerSet: cost } });
  return NextResponse.json({ product });
}
