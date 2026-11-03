import { NextRequest, NextResponse } from "next/server";
import { requireSectionApi } from "@/lib/permissions";
import { deletePartnerBranch, updatePartnerBranch } from "@/lib/accounting/partnerBranches";
import { ACC_PARTNERS_TAG, revalidateAccountingRef } from "@/lib/accounting/refData";

export async function PATCH(req: NextRequest, { params }: { params: { id: string; branchId: string } }) {
  const staff = await requireSectionApi("ACCOUNTING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const branch = await updatePartnerBranch(params.id, params.branchId, await req.json());
    revalidateAccountingRef(ACC_PARTNERS_TAG);
    return NextResponse.json({ branch });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "แก้ไขสาขาไม่สำเร็จ" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; branchId: string } }) {
  const staff = await requireSectionApi("ACCOUNTING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await deletePartnerBranch(params.id, params.branchId);
    revalidateAccountingRef(ACC_PARTNERS_TAG);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ลบสาขาไม่สำเร็จ" }, { status: 400 });
  }
}
