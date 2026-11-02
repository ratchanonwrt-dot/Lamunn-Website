import { NextRequest, NextResponse } from "next/server";
import { requireSectionApi } from "@/lib/permissions";
import { parseDateOnly } from "@/lib/dates";
import { signedInputToSatang } from "@/lib/accounting/money";
import { disposeFixedAsset } from "@/lib/accounting/fixedAssets";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireSectionApi("ACCOUNTING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const result = await disposeFixedAsset({
      assetId: params.id,
      saleDate: parseDateOnly(String(body.saleDate)),
      quantity: Number(body.quantity),
      saleBaseSatang: signedInputToSatang(body.saleBaseAmount),
      vatSatang: signedInputToSatang(body.vatAmount),
      buyer: body.buyer,
      documentNo: body.documentNo,
      note: body.note,
      userId: staff.staffId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "บันทึกการขายไม่สำเร็จ" }, { status: 400 });
  }
}
