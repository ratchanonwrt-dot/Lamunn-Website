import { NextRequest, NextResponse } from "next/server";
import type { AccFixedAssetCategory } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { parseDateOnly } from "@/lib/dates";
import { signedInputToSatang } from "@/lib/accounting/money";
import { createManualFixedAssets, FIXED_ASSET_POLICIES, loadFixedAssetRegister } from "@/lib/accounting/fixedAssets";

const CATEGORIES = new Set(Object.keys(FIXED_ASSET_POLICIES));

export async function GET() {
  const staff = await requireSectionApi("ACCOUNTING", "view");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ assets: await loadFixedAssetRegister() });
}

export async function POST(req: NextRequest) {
  const staff = await requireSectionApi("ACCOUNTING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const category = String(body.category) as AccFixedAssetCategory;
    if (!CATEGORIES.has(category)) return NextResponse.json({ error: "หมวดทรัพย์สินไม่ถูกต้อง" }, { status: 400 });
    const asset = await createManualFixedAssets({
      name: String(body.name ?? ""),
      category,
      quantity: Number(body.quantity),
      purchaseDate: parseDateOnly(String(body.purchaseDate)),
      availableDate: parseDateOnly(String(body.availableDate)),
      unitCostSatang: signedInputToSatang(body.unitCost),
      residualValueSatang: signedInputToSatang(body.residualValue),
      usefulLifeMonths: Number(body.usefulLifeMonths) || undefined,
      invoiceNo: body.invoiceNo,
      branchId: body.branchId,
      assetAccountId: String(body.assetAccountId ?? ""),
      note: body.note,
      createdBy: staff.staffId,
    });
    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "เพิ่มทรัพย์สินไม่สำเร็จ" }, { status: 400 });
  }
}
