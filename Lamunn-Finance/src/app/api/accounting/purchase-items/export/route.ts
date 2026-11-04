import { NextRequest, NextResponse } from "next/server";
import { requireSectionApi } from "@/lib/permissions";
import { getAllSettings } from "@/lib/settings";
import { monthRange } from "@/lib/dates";
import { loadPurchaseItemReport } from "@/lib/accounting/purchaseItemReport";
import { buildPurchaseItemWorkbook, purchaseItemExcelFilename } from "@/lib/accounting/purchaseItemExcel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const staff = await requireSectionApi("ACCOUNTING", "view");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const year = Number(req.nextUrl.searchParams.get("year")) || now.getUTCFullYear();
  const month = Number(req.nextUrl.searchParams.get("month")) || now.getUTCMonth() + 1;
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "งวดรายงานไม่ถูกต้อง" }, { status: 400 });
  }

  const { start, end } = monthRange(year, month - 1);
  const [settings, report] = await Promise.all([getAllSettings(), loadPurchaseItemReport(start, end)]);
  const workbook = buildPurchaseItemWorkbook(report, { companyName: settings.companyName, year, month });
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${purchaseItemExcelFilename(year, month)}"`,
      "Cache-Control": "no-store",
    },
  });
}
