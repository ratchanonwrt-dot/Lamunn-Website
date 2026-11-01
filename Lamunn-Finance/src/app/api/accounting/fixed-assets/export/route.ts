import { NextRequest, NextResponse } from "next/server";
import { requireSectionApi } from "@/lib/permissions";
import { getAllSettings } from "@/lib/settings";
import { loadDepreciationSchedule } from "@/lib/accounting/fixedAssets";
import { buildFixedAssetWorkbook } from "@/lib/accounting/fixedAssetExcel";

export async function GET(req: NextRequest) {
  const staff = await requireSectionApi("ACCOUNTING", "view");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const now = new Date();
  const year = Number(req.nextUrl.searchParams.get("year")) || now.getUTCFullYear();
  const month = Number(req.nextUrl.searchParams.get("month")) || now.getUTCMonth() + 1;
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "งวดบัญชีไม่ถูกต้อง" }, { status: 400 });
  }
  const [settings, assets] = await Promise.all([getAllSettings(), loadDepreciationSchedule(year, month)]);
  const workbook = buildFixedAssetWorkbook(assets, { companyName: settings.companyName, year, month });
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="fixed-assets-${year}-${String(month).padStart(2, "0")}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
