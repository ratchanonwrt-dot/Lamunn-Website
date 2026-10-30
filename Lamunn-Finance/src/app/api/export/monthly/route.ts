import { NextRequest } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { monthRange } from "@/lib/dates";
import { buildXlsx, xlsxResponse, type ExportSheet } from "@/lib/exportXlsx";
import { thaiMonthLabel } from "@/lib/format";

const thaiMonthsShort = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const weekdaysShort = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

export async function GET(req: NextRequest) {
  const staff = await requireSectionApi("MONTHLY", "view");
  if (!staff) return new Response("unauthorized", { status: 401 });

  const { searchParams } = req.nextUrl;
  const sections = new Set((searchParams.get("sections") ?? "").split(",").filter(Boolean));
  const now = new Date();
  const year = Number(searchParams.get("year")) || now.getUTCFullYear();
  const month = Number(searchParams.get("month")) || now.getUTCMonth() + 1;
  const { start, end } = monthRange(year, month - 1);
  const daysInMonth = end.getUTCDate();

  const branches = await prisma.branch.findMany({ orderBy: { sortOrder: "asc" } });
  const [salesRows, companyRows] = await Promise.all([
    prisma.dailySales.findMany({ where: { date: { gte: start, lte: end } }, include: { branch: { select: { type: true, name: true } } } }),
    prisma.companyChannelDaily.findMany({ where: { date: { gte: start, lte: end } } }),
  ]);

  const sheets: ExportSheet[] = [];

  if (sections.has("dailySummary")) {
    const dayTotals = new Map<string, { storefrontTotal: number; grab: number; lineman: number; shopee: number }>();
    for (const r of salesRows) {
      const key = r.date.toISOString().slice(0, 10);
      const existing = dayTotals.get(key) ?? { storefrontTotal: 0, grab: 0, lineman: 0, shopee: 0 };
      const storefront = r.branch.type === "CASH" ? (r.cashPos ?? 0) + (r.transfer ?? 0) : r.cashTransferCombined ?? 0;
      existing.storefrontTotal += storefront;
      existing.grab += r.grab;
      existing.lineman += r.lineman;
      existing.shopee += r.shopee;
      dayTotals.set(key, existing);
    }
    const companyByDate = new Map(companyRows.map((c) => [c.date.toISOString().slice(0, 10), c]));
    const rows = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(Date.UTC(year, month - 1, day));
      const key = d.toISOString().slice(0, 10);
      const t = dayTotals.get(key) ?? { storefrontTotal: 0, grab: 0, lineman: 0, shopee: 0 };
      const c = companyByDate.get(key);
      rows.push({
        date: `${day} ${thaiMonthsShort[month - 1]} (${weekdaysShort[d.getUTCDay()]})`,
        storefrontTotal: t.storefrontTotal,
        grab: t.grab,
        lineman: t.lineman,
        shopee: t.shopee,
        tiktok: c?.tiktok ?? 0,
        fbLine: c?.fbLine ?? 0,
        pickup: c?.pickup ?? 0,
        catering: c?.catering ?? 0,
        total: t.storefrontTotal + t.grab + t.lineman + t.shopee + (c?.tiktok ?? 0) + (c?.fbLine ?? 0) + (c?.pickup ?? 0) + (c?.catering ?? 0),
      });
    }
    sheets.push({
      name: "สรุปรายวัน",
      columns: [
        { header: "วันที่", key: "date", width: 18 },
        { header: "หน้าร้านรวม", key: "storefrontTotal", width: 14 },
        { header: "Grab", key: "grab", width: 12 },
        { header: "Lineman", key: "lineman", width: 12 },
        { header: "Shopee", key: "shopee", width: 12 },
        { header: "TikTok", key: "tiktok", width: 12 },
        { header: "FB / Line", key: "fbLine", width: 12 },
        { header: "รับหน้าร้าน", key: "pickup", width: 12 },
        { header: "Catering", key: "catering", width: 12 },
        { header: "รวมวันนั้น", key: "total", width: 14 },
      ],
      rows,
    });
  }

  if (sections.has("branchDaily")) {
    const branchById = new Map(branches.map((b) => [b.id, b]));
    const rows = salesRows
      .map((r) => {
        const branch = branchById.get(r.branchId);
        const storefront = r.branch.type === "CASH" ? (r.cashPos ?? 0) + (r.transfer ?? 0) : r.cashTransferCombined ?? 0;
        return {
          branch: branch?.name ?? "-",
          date: r.date.toISOString().slice(0, 10),
          storefront,
          grab: r.grab,
          lineman: r.lineman,
          shopee: r.shopee,
          total: storefront + r.grab + r.lineman + r.shopee,
        };
      })
      .sort((a, b) => a.branch.localeCompare(b.branch) || a.date.localeCompare(b.date));
    sheets.push({
      name: "ยอดขายรายสาขาxรายวัน",
      columns: [
        { header: "สาขา", key: "branch", width: 22 },
        { header: "วันที่", key: "date", width: 14 },
        { header: "หน้าร้าน", key: "storefront", width: 14 },
        { header: "Grab", key: "grab", width: 12 },
        { header: "Lineman", key: "lineman", width: 12 },
        { header: "Shopee", key: "shopee", width: 12 },
        { header: "รวม", key: "total", width: 14 },
      ],
      rows,
    });
  }

  if (sections.has("ranking")) {
    const branchMonthTotal = new Map<string, { storefront: number; grab: number; lineman: number; shopee: number }>();
    for (const r of salesRows) {
      const storefront = r.branch.type === "CASH" ? (r.cashPos ?? 0) + (r.transfer ?? 0) : r.cashTransferCombined ?? 0;
      const existing = branchMonthTotal.get(r.branchId) ?? { storefront: 0, grab: 0, lineman: 0, shopee: 0 };
      existing.storefront += storefront;
      existing.grab += r.grab;
      existing.lineman += r.lineman;
      existing.shopee += r.shopee;
      branchMonthTotal.set(r.branchId, existing);
    }
    const rows = branches
      .map((b) => {
        const t = branchMonthTotal.get(b.id) ?? { storefront: 0, grab: 0, lineman: 0, shopee: 0 };
        return { branch: b.name, storefront: t.storefront, grab: t.grab, lineman: t.lineman, shopee: t.shopee, total: t.storefront + t.grab + t.lineman + t.shopee };
      })
      .sort((a, b) => b.total - a.total);
    sheets.push({
      name: "Ranking สาขา",
      columns: [
        { header: "สาขา", key: "branch", width: 22 },
        { header: "หน้าร้าน", key: "storefront", width: 14 },
        { header: "Grab", key: "grab", width: 12 },
        { header: "Lineman", key: "lineman", width: 12 },
        { header: "Shopee", key: "shopee", width: 12 },
        { header: "รวม", key: "total", width: 14 },
      ],
      rows,
    });
  }

  const buffer = await buildXlsx(sheets);
  return xlsxResponse(buffer, `ยอดขายรายเดือน_${thaiMonthLabel(year, month - 1)}.xlsx`);
}
