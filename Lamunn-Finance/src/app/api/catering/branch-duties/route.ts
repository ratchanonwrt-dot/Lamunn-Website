import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { BRANCH_DUTY_AMOUNT, isBranchDutyKind } from "@/lib/cateringBranchDuty";

/** บันทึกว่าพนักงาน Catering ไปสอนงานหน้าสาขา / แทนสาขา วันไหน (ค่าข้าวเหมาต่อวันตามหมวด) */
export async function POST(req: NextRequest) {
  const staff = await requireSectionApi("CATERING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.staffName ?? "").trim();
  const dateStr = String(body.date ?? "");
  if (!name) return NextResponse.json({ error: "เลือกพนักงาน" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || Number.isNaN(new Date(`${dateStr}T00:00:00.000Z`).getTime())) {
    return NextResponse.json({ error: "วันที่ไม่ถูกต้อง" }, { status: 400 });
  }
  const kind = body.kind;
  if (!isBranchDutyKind(kind)) return NextResponse.json({ error: "เลือกหมวดงาน" }, { status: 400 });

  // ต้องเป็นคนในรายชื่อ — ชื่อใช้จับคู่กับสรุปค่าข้าวรายคน พิมพ์เองแล้วสะกดต่างจะหลุดไม่รวมยอด
  const member = await prisma.cateringStaff.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (!member) return NextResponse.json({ error: `ไม่พบ "${name}" ในรายชื่อพนักงาน Catering` }, { status: 400 });

  const date = new Date(`${dateStr}T00:00:00.000Z`);
  const dup = await prisma.cateringBranchDuty.findFirst({ where: { staffName: member.name, date, kind } });
  if (dup) return NextResponse.json({ error: "มีรายการนี้ของคนนี้ในวันนั้นแล้ว" }, { status: 409 });

  const created = await prisma.cateringBranchDuty.create({
    data: {
      staffName: member.name,
      date,
      kind,
      amount: BRANCH_DUTY_AMOUNT[kind],
      branchName: body.branchName ? String(body.branchName).trim() || null : null,
      note: body.note ? String(body.note).trim() || null : null,
    },
  });
  return NextResponse.json({ duty: created });
}
