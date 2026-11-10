import { NextRequest, NextResponse } from "next/server";
import { requireSectionApi } from "@/lib/permissions";
import { clearAllChannelCashReport } from "@/lib/accounting/allChannelCash";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest) {
  const staff = await requireSectionApi("ACCOUNTING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const year = Number(req.nextUrl.searchParams.get("year"));
  const month = Number(req.nextUrl.searchParams.get("month"));
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "เดือนหรือปีไม่ถูกต้อง" }, { status: 400 });
  }
  const deleted = await clearAllChannelCashReport(year, month);
  return NextResponse.json({ deleted });
}
