import { NextRequest, NextResponse } from "next/server";
import { requireSectionApi } from "@/lib/permissions";
import { getAllSettings } from "@/lib/settings";
import { loadPurchaseItemReport, purchaseItemReportFilters } from "@/lib/accounting/purchaseItemReport";
import { buildPurchaseItemWorkbook, purchaseItemExcelFilename } from "@/lib/accounting/purchaseItemExcel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const staff = await requireSectionApi("ACCOUNTING", "view");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const filters = purchaseItemReportFilters({
    from: req.nextUrl.searchParams.get("from") ?? undefined,
    to: req.nextUrl.searchParams.get("to") ?? undefined,
    category: req.nextUrl.searchParams.get("category") ?? undefined,
    year: req.nextUrl.searchParams.get("year") ?? undefined,
    month: req.nextUrl.searchParams.get("month") ?? undefined,
  });
  const [settings, report] = await Promise.all([getAllSettings(), loadPurchaseItemReport(filters.start, filters.end, filters.category)]);
  const workbook = buildPurchaseItemWorkbook(report, { companyName: settings.companyName, from: filters.from, to: filters.to, category: filters.category });
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${purchaseItemExcelFilename(filters.from, filters.to)}"`,
      "Cache-Control": "no-store",
    },
  });
}
