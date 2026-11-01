import { NextRequest, NextResponse } from "next/server";
import { prisma, type AccFixedAssetCategory } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { parseDateOnly } from "@/lib/dates";
import { signedInputToSatang, toBaht } from "@/lib/accounting/money";
import { FIXED_ASSET_POLICIES } from "@/lib/accounting/fixedAssets";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireSectionApi("ACCOUNTING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const existing = await prisma.accFixedAsset.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "ไม่พบทรัพย์สิน" }, { status: 404 });
    const category = String(body.category ?? existing.category) as AccFixedAssetCategory;
    if (!(category in FIXED_ASSET_POLICIES)) return NextResponse.json({ error: "หมวดทรัพย์สินไม่ถูกต้อง" }, { status: 400 });
    const name = String(body.name ?? existing.name).trim();
    const invoiceNo = String(body.invoiceNo ?? existing.invoiceNo ?? "").trim() || null;
    const branchId = String(body.branchId ?? existing.branchId ?? "").trim() || null;
    const availableDate = body.availableDate ? parseDateOnly(String(body.availableDate)) : existing.availableDate;
    const usefulLifeMonths = category === "LAND" ? 0 : Number(body.usefulLifeMonths ?? existing.usefulLifeMonths);
    const residualValueSatang = body.residualValue === undefined ? signedInputToSatang(existing.residualValue) : signedInputToSatang(body.residualValue);
    if (!name) return NextResponse.json({ error: "กรุณาระบุชื่อทรัพย์สิน" }, { status: 400 });
    if (availableDate < existing.purchaseDate) return NextResponse.json({ error: "วันที่พร้อมใช้ต้องไม่ก่อนวันที่ซื้อ" }, { status: 400 });
    if (!Number.isInteger(usefulLifeMonths) || usefulLifeMonths < 0) return NextResponse.json({ error: "อายุใช้งานไม่ถูกต้อง" }, { status: 400 });
    const totalCostSatang = signedInputToSatang(existing.unitCost) * existing.quantity;
    if (residualValueSatang < 0 || residualValueSatang > totalCostSatang) {
      return NextResponse.json({ error: "มูลค่าซากต้องไม่ติดลบและไม่เกินราคาทุนรวม" }, { status: 400 });
    }
    const asset = await prisma.accFixedAsset.update({
      where: { id: params.id },
      data: {
        name,
        category,
        invoiceNo,
        branchId,
        availableDate,
        usefulLifeMonths,
        residualValue: toBaht(residualValueSatang),
        note: String(body.note ?? existing.note ?? "").trim() || null,
        dataIncomplete: !invoiceNo || !branchId,
      },
    });
    return NextResponse.json({ asset });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "แก้ไขทรัพย์สินไม่สำเร็จ" }, { status: 400 });
  }
}
