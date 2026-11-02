import { NextRequest, NextResponse } from "next/server";
import { requireSectionApi } from "@/lib/permissions";
import { getAllSettings } from "@/lib/settings";
import { loadProjectionReport } from "@/lib/accounting/projection";
import { buildProjectionWorkbook, projectionExcelFilename } from "@/lib/accounting/projectionExcel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const staff = await requireSectionApi("ACCOUNTING", "view");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const year = Number(req.nextUrl.searchParams.get("year"));
  if (!Number.isInteger(year) || year < 2000 || year > 2200) {
    return NextResponse.json({ error: "ปีไม่ถูกต้อง" }, { status: 400 });
  }

  const [settings, report] = await Promise.all([getAllSettings(), loadProjectionReport(year)]);
  const workbook = buildProjectionWorkbook(report, settings.companyName);
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${projectionExcelFilename(year)}"`,
      "Cache-Control": "no-store",
    },
  });
}
