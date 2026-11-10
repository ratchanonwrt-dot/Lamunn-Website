import { NextRequest, NextResponse } from "next/server";
import type { AccWhtFormType } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { monthRange } from "@/lib/dates";
import { getAllSettings } from "@/lib/settings";
import { buildWhtReport } from "@/lib/accounting/taxReports";
import { buildWhtWorkbook, whtExcelFilename } from "@/lib/accounting/whtExcel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const staff = await requireSectionApi("ACCOUNTING", "view");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const year = Number(req.nextUrl.searchParams.get("year")) || now.getUTCFullYear();
  const month = Number(req.nextUrl.searchParams.get("month")) || now.getUTCMonth() + 1;
  const formType = req.nextUrl.searchParams.get("formType") as AccWhtFormType;
  if (formType !== "PND3" && formType !== "PND53") return NextResponse.json({ error: "ประเภทแบบไม่ถูกต้อง" }, { status: 400 });
  if (month < 1 || month > 12) return NextResponse.json({ error: "เดือนไม่ถูกต้อง" }, { status: 400 });

  const { start, end } = monthRange(year, month - 1);
  const [settings, report] = await Promise.all([getAllSettings(), buildWhtReport(start, end, formType)]);
  const workbook = buildWhtWorkbook(report, {
    companyName: settings.companyName,
    companyTaxId: settings.companyTaxId,
    companyAddress: settings.companyAddress,
    formType,
    year,
    month,
  });
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${whtExcelFilename(formType, year, month)}"`,
      "Cache-Control": "no-store",
    },
  });
}
