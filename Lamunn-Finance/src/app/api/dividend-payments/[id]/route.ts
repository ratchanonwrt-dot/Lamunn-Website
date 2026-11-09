import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireOwner } from "@/lib/requireStaff";
import { logActivity } from "@/lib/activityLog";
import { formatBaht, formatThaiDate } from "@/lib/format";
import { DIVIDEND_SOURCE_LABEL, parseDividendSource } from "@/lib/dividendSource";

/** ติ๊กว่าปันผลรายการนี้จ่ายจากเงินสดหรือบัญชีบริษัท (null = ล้างกลับเป็นยังไม่ระบุ) */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireOwner();
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const source = parseDividendSource(body.source);
  if (source === "invalid") return NextResponse.json({ error: "source must be CASH or BANK" }, { status: 400 });

  const payment = await prisma.dividendPayment.update({ where: { id: params.id }, data: { source } });
  await logActivity({
    staffId: staff.staffId,
    staffName: staff.staffName,
    action: "UPDATE",
    entity: "DividendPayment",
    summary: `ปันผล ${formatBaht(payment.amount)} บาท (${formatThaiDate(payment.date)}) — จ่ายจาก ${source ? DIVIDEND_SOURCE_LABEL[source] : "ยังไม่ระบุ"}`,
  });
  return NextResponse.json({ payment });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireOwner();
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const existing = await prisma.dividendPayment.delete({ where: { id: params.id } });
  await logActivity({
    staffId: staff.staffId,
    staffName: staff.staffName,
    action: "DELETE",
    entity: "DividendPayment",
    summary: `ลบรายการปันผล — ${formatBaht(existing.amount)} บาท (${formatThaiDate(existing.date)})`,
  });
  return NextResponse.json({ ok: true });
}
