import { NextRequest } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { parseDateOnly } from "@/lib/dates";
import { buildXlsx, xlsxResponse, type ExportSheet } from "@/lib/exportXlsx";
import { formatThaiDate, toDateInputValue } from "@/lib/format";

function storefrontOf(r: { cashPos: number | null; transfer: number | null; cashTransferCombined: number | null }, branchType: string) {
  return branchType === "CASH" ? (r.cashPos ?? 0) + (r.transfer ?? 0) : r.cashTransferCombined ?? 0;
}

export async function GET(req: NextRequest) {
  const staff = await requireSectionApi("REPORTS", "view");
  if (!staff) return new Response("unauthorized", { status: 401 });

  const { searchParams } = req.nextUrl;
  const branchId = searchParams.get("branchId") ?? "";
  const from = searchParams.get("from") ?? toDateInputValue(new Date());
  const to = searchParams.get("to") ?? toDateInputValue(new Date());
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);

  const [rows, branch] = await Promise.all([
    prisma.dailySales.findMany({
      where: { date: { gte: start, lte: end }, ...(branchId ? { branchId } : {}) },
      orderBy: [{ branchId: "asc" }, { date: "asc" }],
      include: { branch: { select: { name: true, type: true } } },
    }),
    branchId ? prisma.branch.findUnique({ where: { id: branchId }, select: { name: true } }) : null,
  ]);

  const sheetRows = rows.map((r) => {
    const storefront = storefrontOf(r, r.branch.type);
    return {
      branch: r.branch.name,
      date: formatThaiDate(r.date),
      storefront,
      grab: r.grab,
      lineman: r.lineman,
      shopee: r.shopee,
      total: storefront + r.grab + r.lineman + r.shopee,
    };
  });

  const sheets: ExportSheet[] = [
    {
      name: "ยอดขายรายสาขา",
      columns: [
        { header: "สาขา", key: "branch", width: 22 },
        { header: "วันที่", key: "date", width: 18 },
        { header: "หน้าร้าน", key: "storefront", width: 14 },
        { header: "Grab", key: "grab", width: 12 },
        { header: "Lineman", key: "lineman", width: 12 },
        { header: "Shopee", key: "shopee", width: 12 },
        { header: "รวม", key: "total", width: 14 },
      ],
      rows: sheetRows,
    },
  ];

  const buffer = await buildXlsx(sheets);
  const branchTag = branchId ? branch?.name ?? branchId : "ทุกสาขา";
  return xlsxResponse(buffer, `ยอดขายรายสาขา_${branchTag}_${from}_ถึง_${to}.xlsx`);
}
