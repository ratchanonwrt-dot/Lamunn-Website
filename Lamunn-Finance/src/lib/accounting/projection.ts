import { prisma } from "@lamunn/db-finance";
import { toSatang } from "./money";
import { buildIncomeStatement, type AccountBalance } from "./reports";

export interface ProjectionMonth {
  month: number;
  estimatedRevenue: number;
  actualRevenue: number;
  estimatedExpense: number;
  actualExpense: number;
  estimatedBalance: number;
  actualBalance: number;
}

export interface ProjectionLoss {
  lossYear: number;
  amount: number;
}

export interface ProjectionTotals {
  estimatedRevenue: number;
  actualRevenue: number;
  estimatedExpense: number;
  actualExpense: number;
  estimatedBalance: number;
  actualBalance: number;
  estimatedLossDeducted: number;
  actualLossDeducted: number;
  estimatedAfterLoss: number;
  actualAfterLoss: number;
}

export interface ProjectionReport {
  year: number;
  months: ProjectionMonth[];
  losses: ProjectionLoss[];
  totalLossAvailable: number;
  totals: ProjectionTotals;
}

function sumMonths(months: ProjectionMonth[], key: keyof Omit<ProjectionMonth, "month">) {
  return months.reduce((sum, month) => sum + month[key], 0);
}

export function calculateProjectionTotals(months: ProjectionMonth[], totalLossAvailable: number): ProjectionTotals {
  const estimatedRevenue = sumMonths(months, "estimatedRevenue");
  const actualRevenue = sumMonths(months, "actualRevenue");
  const estimatedExpense = sumMonths(months, "estimatedExpense");
  const actualExpense = sumMonths(months, "actualExpense");
  const estimatedBalance = estimatedRevenue - estimatedExpense;
  const actualBalance = actualRevenue - actualExpense;
  // ขาดทุนยกมาหักได้ไม่เกินกำไรของสถานการณ์นั้น เพื่อไม่ทำให้ยอดหลังหักกลายเป็นขาดทุนจากการใช้สิทธิ
  const estimatedLossDeducted = Math.min(totalLossAvailable, Math.max(0, estimatedBalance));
  const actualLossDeducted = Math.min(totalLossAvailable, Math.max(0, actualBalance));

  return {
    estimatedRevenue,
    actualRevenue,
    estimatedExpense,
    actualExpense,
    estimatedBalance,
    actualBalance,
    estimatedLossDeducted,
    actualLossDeducted,
    estimatedAfterLoss: estimatedBalance - estimatedLossDeducted,
    actualAfterLoss: actualBalance - actualLossDeducted,
  };
}

/** โหลดผลจริงทั้งปีจากบรรทัด POSTED ชุดเดียวกับงบกำไรขาดทุน แล้วประกอบกับตัวเลขประมาณการที่เก็บแยกไว้ */
export async function loadProjectionReport(year: number): Promise<ProjectionReport> {
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));
  const [accounts, lines, projections, storedLosses] = await Promise.all([
    prisma.accAccount.findMany({ orderBy: { code: "asc" } }),
    prisma.accJournalLine.findMany({
      where: { status: "POSTED", date: { gte: from, lt: to } },
      select: { accountId: true, date: true, debit: true, credit: true },
    }),
    prisma.accFinancialProjection.findMany({ where: { year } }),
    prisma.accTaxLossCarryforward.findMany({
      where: { reportYear: year, lossYear: { gte: year - 5, lt: year } },
      orderBy: { lossYear: "asc" },
    }),
  ]);

  const movementByMonth = Array.from({ length: 12 }, () => new Map<string, { debit: number; credit: number }>());
  for (const line of lines) {
    const monthIndex = line.date.getUTCMonth();
    const current = movementByMonth[monthIndex].get(line.accountId) ?? { debit: 0, credit: 0 };
    current.debit += toSatang(line.debit);
    current.credit += toSatang(line.credit);
    movementByMonth[monthIndex].set(line.accountId, current);
  }

  const projectionMap = new Map(projections.map((projection) => [projection.month, projection]));
  const months: ProjectionMonth[] = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const movement = movementByMonth[index];
    const balances: AccountBalance[] = accounts.map((account) => {
      const amount = movement.get(account.id) ?? { debit: 0, credit: 0 };
      return {
        id: account.id,
        code: account.code,
        nameTh: account.nameTh,
        type: account.type,
        parentCode: account.parentCode,
        isPostable: account.isPostable,
        opening: 0,
        debit: amount.debit,
        credit: amount.credit,
        closing: amount.debit - amount.credit,
      };
    });
    const actual = buildIncomeStatement(balances);
    const projection = projectionMap.get(month);
    const estimatedRevenue = toSatang(projection?.estimatedRevenue);
    const estimatedExpense = toSatang(projection?.estimatedExpense);
    // ค่าใช้จ่ายจริงรวมต้นทุนขาย ค่าใช้จ่ายขาย/บริหาร ต้นทุนทางการเงิน และภาษีเงินได้ จึงตรงกับกำไรสุทธิในงบ
    const actualExpense = actual.totalExpenses + actual.financeCost.total + actual.incomeTax.total;

    return {
      month,
      estimatedRevenue,
      actualRevenue: actual.totalRevenue,
      estimatedExpense,
      actualExpense,
      estimatedBalance: estimatedRevenue - estimatedExpense,
      actualBalance: actual.netProfit,
    };
  });

  const storedLossMap = new Map(storedLosses.map((loss) => [loss.lossYear, toSatang(loss.amount)]));
  const losses = Array.from({ length: 5 }, (_, index) => {
    const lossYear = year - 5 + index;
    return { lossYear, amount: storedLossMap.get(lossYear) ?? 0 };
  });
  const totalLossAvailable = losses.reduce((sum, loss) => sum + loss.amount, 0);

  return {
    year,
    months,
    losses,
    totalLossAvailable,
    totals: calculateProjectionTotals(months, totalLossAvailable),
  };
}
