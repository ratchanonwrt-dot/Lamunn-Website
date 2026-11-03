import { NextRequest, NextResponse } from "next/server";
import { requireSectionApi } from "@/lib/permissions";
import { createPartnerBranch } from "@/lib/accounting/partnerBranches";
import { ACC_PARTNERS_TAG, revalidateAccountingRef } from "@/lib/accounting/refData";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireSectionApi("ACCOUNTING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const branch = await createPartnerBranch({ partnerId: params.id, ...body });
    revalidateAccountingRef(ACC_PARTNERS_TAG);
    return NextResponse.json({ branch }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "เพิ่มสาขาไม่สำเร็จ" }, { status: 400 });
  }
}
