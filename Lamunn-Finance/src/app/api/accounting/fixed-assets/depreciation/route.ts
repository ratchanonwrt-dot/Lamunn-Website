import { NextRequest, NextResponse } from "next/server";
import { requireSectionApi } from "@/lib/permissions";
import { createDepreciationDraft } from "@/lib/accounting/fixedAssets";

export async function POST(req: NextRequest) {
  const staff = await requireSectionApi("ACCOUNTING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const year = Number(body.year);
    const month = Number(body.month);
    if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: "งวดบัญชีไม่ถูกต้อง" }, { status: 400 });
    }
    const entry = await createDepreciationDraft(year, month, staff.staffId);
    return NextResponse.json({ entry });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "สร้างใบสำคัญไม่สำเร็จ" }, { status: 400 });
  }
}
