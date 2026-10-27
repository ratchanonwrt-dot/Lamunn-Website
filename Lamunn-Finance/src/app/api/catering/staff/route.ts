import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { parseDayOffs } from "@/lib/cateringStaffPay";

/** เพิ่มพนักงาน Catering เข้ารายชื่อ — ชื่อซ้ำ (ไม่สนตัวพิมพ์) ไม่ได้ เพราะใช้ชื่อจับคู่กับงานที่จัดไว้ */
export async function POST(req: NextRequest) {
  const staff = await requireSectionApi("CATERING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "กรอกชื่อพนักงาน" }, { status: 400 });

  const dup = await prisma.cateringStaff.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (dup) return NextResponse.json({ error: `มีชื่อ "${dup.name}" อยู่แล้ว` }, { status: 409 });

  const created = await prisma.cateringStaff.create({
    data: {
      name,
      dayOffs: parseDayOffs(body.dayOffs).join(","),
      otRatePerHour: Math.max(0, Number(body.otRatePerHour) || 0),
      dayOffRatePerHour: body.dayOffRatePerHour === "" || body.dayOffRatePerHour == null ? null : Math.max(0, Number(body.dayOffRatePerHour) || 0),
      note: body.note ? String(body.note) : null,
    },
  });
  return NextResponse.json({ staff: created });
}
