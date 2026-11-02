import { NextRequest } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { monthRange } from "@/lib/dates";
import { computeRent } from "@/lib/rentCalc";
import { getEffectiveGpRates } from "@/lib/gpRateHistory";
import { buildXlsx, xlsxResponse, type ExportSheet } from "@/lib/exportXlsx";
import { thaiMonthLabel } from "@/lib/format";

type PaymentStatus = "PENDING" | "TRANSFER_SCHEDULED" | "PAID_AWAITING_BILL" | "RECEIPT_RECEIVED";
const STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: "ยังไม่จ่าย",
  TRANSFER_SCHEDULED: "ตั้งโอนแล้ว",
  PAID_AWAITING_BILL: "จ่ายแล้วรอบิล",
  RECEIPT_RECEIVED: "ได้รับใบเสร็จแล้ว",
};

export async function GET(req: NextRequest) {
  const staff = await requireSectionApi("RENT", "view");
  if (!staff) return new Response("unauthorized", { status: 401 });

  const { searchParams } = req.nextUrl;
  const sections = new Set((searchParams.get("sections") ?? "").split(",").filter(Boolean));
  const now = new Date();
  const year = Number(searchParams.get("year")) || now.getUTCFullYear();
  const month = Number(searchParams.get("month")) || now.getUTCMonth() + 1;
  const { start, end } = monthRange(year, month - 1);

  const branches = await prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, include: { rentConfig: true } });
  const [salesAgg, paymentRows] = await Promise.all([
    prisma.dailySales.groupBy({
      by: ["branchId"],
      where: { date: { gte: start, lte: end } },
      _sum: { cashPos: true, transfer: true, cashTransferCombined: true, grab: true, lineman: true },
    }),
    prisma.rentPayment.findMany({ where: { year, month } }),
  ]);
  const salesByBranch = new Map(salesAgg.map((s) => [s.branchId, s._sum]));
  const paymentByBranch = new Map(paymentRows.map((p) => [p.branchId, { status: p.status as PaymentStatus, minimumPaid: p.minimumPaid }]));
  const baseRates = new Map(
    branches.filter((b) => b.rentConfig).map((b) => [b.id, { gpPercentStorefront: b.rentConfig!.gpPercentStorefront, gpPercentDelivery: b.rentConfig!.gpPercentDelivery }])
  );
  const effectiveRates = await getEffectiveGpRates(year, month, baseRates);

  // เฉพาะสาขาที่เปิดจริงในเดือนนั้น (มียอดขาย) — ให้ตรงกับหน้าค่าเช่า
  const rows = branches
    .filter((b) => b.rentConfig)
    .filter((b) => {
      const s = salesByBranch.get(b.id);
      return (s?.cashPos ?? 0) + (s?.transfer ?? 0) + (s?.cashTransferCombined ?? 0) + (s?.grab ?? 0) + (s?.lineman ?? 0) > 0;
    })
    .map((b) => {
      const s = salesByBranch.get(b.id);
      const storefront = b.type === "CASH" ? (s?.cashPos ?? 0) + (s?.transfer ?? 0) : s?.cashTransferCombined ?? 0;
      const delivery = (s?.grab ?? 0) + (s?.lineman ?? 0);
      const rate = effectiveRates.get(b.id)!;
      const result = computeRent({ ...b.rentConfig!, ...rate }, storefront, delivery);
      const payment = paymentByBranch.get(b.id) ?? { status: "PENDING" as PaymentStatus, minimumPaid: false };
      const minAmount = b.rentConfig!.minAmount;
      const netOutstanding = minAmount && payment.minimumPaid ? Math.max(0, result.rentAmount - minAmount) : result.rentAmount;
      return { branch: b, storefront, delivery, rate, result, payment, minAmount, netOutstanding };
    });

  const columns: ExportSheet["columns"] = [
    { header: "สาขา", key: "branch", width: 24 },
    { header: "ประเภท", key: "type", width: 14 },
  ];
  if (sections.has("sales")) {
    columns.push({ header: "ยอดขายหน้าร้าน", key: "storefront", width: 16 }, { header: "ยอดขาย Delivery", key: "delivery", width: 16 }, { header: "ยอดขายรวม", key: "total", width: 16 });
  }
  if (sections.has("rentConfig")) {
    columns.push(
      { header: "ประเภทค่าเช่า", key: "rentType", width: 14 },
      { header: "GP% หน้าร้าน", key: "gpStorefront", width: 14 },
      { header: "GP% Delivery", key: "gpDelivery", width: 14 },
      { header: "Minimum", key: "minAmount", width: 14 }
    );
  }
  if (sections.has("rentAmount")) {
    columns.push({ header: "ค่าเช่าประมาณการ", key: "rentAmount", width: 16 }, { header: "ถึง Minimum แล้วหรือยัง", key: "minimumApplied", width: 18 });
  }
  if (sections.has("minimumPaid")) {
    columns.push({ header: "จ่าย Minimum ให้ห้างแล้วหรือยัง", key: "minimumPaid", width: 22 }, { header: "ค้างจ่ายจริง (net)", key: "netOutstanding", width: 16 });
  }
  if (sections.has("paymentStatus")) {
    columns.push({ header: "ประเภทจ่าย", key: "payType", width: 16 }, { header: "สถานะจ่ายค่าเช่า", key: "payStatus", width: 18 });
  }

  const dataRows = rows.map(({ branch, storefront, delivery, rate, result, payment, minAmount, netOutstanding }) => ({
    branch: branch.name,
    type: branch.type === "CASH" ? "เงินสด" : "Credit Term",
    storefront,
    delivery,
    total: storefront + delivery,
    rentType: result.rentAmount === result.gpAmount || minAmount ? (branch.rentConfig!.rentType === "FIX_RATE" ? "คงที่" : "GP%") : "GP%",
    gpStorefront: rate.gpPercentStorefront,
    gpDelivery: rate.gpPercentDelivery,
    minAmount: minAmount ?? "",
    rentAmount: result.rentAmount,
    minimumApplied: result.minimumApplied ? "ยังไม่ถึง" : minAmount ? "ถึงแล้ว" : "-",
    minimumPaid: minAmount ? (payment.minimumPaid ? "จ่ายแล้ว" : "ยังไม่จ่าย") : "-",
    netOutstanding,
    payType: branch.type === "CASH" ? "จ่ายเองสิ้นเดือน" : "หักจาก Credit Term",
    payStatus: STATUS_LABEL[payment.status],
  }));

  const sheets: ExportSheet[] = [{ name: "ค่าเช่า", columns, rows: dataRows }];
  const buffer = await buildXlsx(sheets);
  return xlsxResponse(buffer, `ค่าเช่า_${thaiMonthLabel(year, month - 1)}.xlsx`);
}
