import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { parseDateOnly } from "@/lib/dates";
import { logActivity } from "@/lib/activityLog";
import { formatBaht } from "@/lib/format";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireSectionApi("HELD_DEPOSITS", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { depositedAt, status, vatType } = body;

  const data: Record<string, unknown> = {};
  if (depositedAt !== undefined) data.depositedAt = depositedAt ? parseDateOnly(depositedAt) : null;
  if (status !== undefined) {
    const STATUSES = ["CONTRACT_ONGOING", "NOT_RETURNED", "DEDUCTED", "RETURNED"];
    if (!STATUSES.includes(status)) return NextResponse.json({ error: "invalid status" }, { status: 400 });
    data.status = status;
  }
  if (vatType !== undefined) {
    const VAT_TYPES = ["INCLUDES_VAT", "EXCLUDES_VAT", "NO_VAT"];
    if (vatType !== null && !VAT_TYPES.includes(vatType)) {
      return NextResponse.json({ error: "invalid vatType" }, { status: 400 });
    }
    data.vatType = vatType;
  }

  const deposit = await prisma.heldDeposit.update({
    where: { id: params.id },
    data,
  });
  return NextResponse.json({ deposit });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireSectionApi("HELD_DEPOSITS", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const existing = await prisma.heldDeposit.delete({ where: { id: params.id } });
  await logActivity({
    staffId: staff.staffId,
    staffName: staff.staffName,
    action: "DELETE",
    entity: "HeldDeposit",
    summary: `ลบเงินมัดจำ — ${existing.location} ${formatBaht(existing.amount)} บาท`,
  });
  return NextResponse.json({ ok: true });
}
