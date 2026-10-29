import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { signedInputToSatang, toBaht } from "@/lib/accounting/money";
import { loadProjectionReport } from "@/lib/accounting/projection";

function validYear(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 2000 && Number(value) <= 2200;
}

function nonNegativeSatang(value: unknown) {
  const amount = signedInputToSatang(typeof value === "string" || typeof value === "number" ? value : null);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

export async function POST(req: NextRequest) {
  const staff = await requireSectionApi("ACCOUNTING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const year = Number(body.year);
  const month = Number(body.month);
  const estimatedRevenue = nonNegativeSatang(body.estimatedRevenue);
  const estimatedExpense = nonNegativeSatang(body.estimatedExpense);
  if (!validYear(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "ปีหรือเดือนไม่ถูกต้อง" }, { status: 400 });
  }
  if (estimatedRevenue === null || estimatedExpense === null) {
    return NextResponse.json({ error: "ยอดประมาณการต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป" }, { status: 400 });
  }

  const losses: Array<{ lossYear?: unknown; amount?: unknown }> = Array.isArray(body.losses) ? body.losses : [];
  const parsedLosses: Array<{ lossYear: number; amount: number | null }> = losses.map((item) => ({
    lossYear: Number(item.lossYear),
    amount: nonNegativeSatang(item.amount),
  }));
  const expectedYears = new Set(Array.from({ length: 5 }, (_, index) => year - 5 + index));
  if (
    parsedLosses.length !== 5 ||
    new Set(parsedLosses.map((item) => item.lossYear)).size !== 5 ||
    parsedLosses.some((item) => !expectedYears.has(item.lossYear) || item.amount === null)
  ) {
    return NextResponse.json({ error: "ขาดทุนยกมาต้องระบุครบ 5 ปีก่อนรอบบัญชีปัจจุบันและยอดต้องไม่ติดลบ" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.accFinancialProjection.upsert({
      where: { year_month: { year, month } },
      create: { year, month, estimatedRevenue: toBaht(estimatedRevenue), estimatedExpense: toBaht(estimatedExpense) },
      update: { estimatedRevenue: toBaht(estimatedRevenue), estimatedExpense: toBaht(estimatedExpense) },
    }),
    ...parsedLosses.map((loss) =>
      prisma.accTaxLossCarryforward.upsert({
        where: { reportYear_lossYear: { reportYear: year, lossYear: loss.lossYear } },
        create: { reportYear: year, lossYear: loss.lossYear, amount: toBaht(loss.amount!) },
        update: { amount: toBaht(loss.amount!) },
      })
    ),
  ]);

  return NextResponse.json({ report: await loadProjectionReport(year) });
}
