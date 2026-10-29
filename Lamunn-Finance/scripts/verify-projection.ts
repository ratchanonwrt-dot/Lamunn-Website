/** พิสูจน์ว่าหน้าประมาณการเทียบตัวเลขที่กรอกกับผลจริงจากใบสำคัญ POSTED และหักขาดทุนยกมาได้ถูกต้อง
 *
 * ใช้ข้อมูลปี ค.ศ. 2098 ชื่อขึ้นต้น [test] และลบเฉพาะ id ที่สร้างใน finally
 * รัน: npx tsx scripts/verify-projection.ts (จากโฟลเดอร์ Lamunn-Finance)
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const YEAR = 2098;
let fails = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? "ผ่าน  " : "ไม่ผ่าน ❌"}  ${label}${ok ? "" : ` (ได้ ${JSON.stringify(actual)} ควรเป็น ${JSON.stringify(expected)})`}`);
  if (!ok) fails++;
}

async function main() {
  const [{ prisma }, { createEntry }, { loadProjectionReport }] = await Promise.all([
    import("@lamunn/db-finance"),
    import("../src/lib/accounting/post"),
    import("../src/lib/accounting/projection"),
  ]);
  const accountIds: string[] = [];
  const entryIds: string[] = [];
  const projectionIds: string[] = [];
  const lossIds: string[] = [];
  const periodIds: string[] = [];

  try {
    for (const month of [1, 2]) {
      const existing = await prisma.accPeriod.findUnique({ where: { year_month: { year: YEAR, month } } });
      if (existing) throw new Error(`[test] งวด ${month}/${YEAR} มีอยู่ก่อนแล้ว จึงหยุดเพื่อไม่แตะข้อมูลเดิม`);
    }
    const stamp = Date.now().toString(36).toUpperCase();
    const cash = await prisma.accAccount.create({ data: { code: `[test]-PROJ-${stamp}-1110`, nameTh: "[test] เงินสดประมาณการ", type: "ASSET", parentCode: "1100" } });
    const revenue = await prisma.accAccount.create({ data: { code: `[test]-PROJ-${stamp}-4110`, nameTh: "[test] รายได้ประมาณการ", type: "REVENUE", parentCode: "4000" } });
    const expense = await prisma.accAccount.create({ data: { code: `[test]-PROJ-${stamp}-5410`, nameTh: "[test] ค่าใช้จ่ายประมาณการ", type: "EXPENSE", parentCode: "5400" } });
    accountIds.push(cash.id, revenue.id, expense.id);

    for (const [monthIndex, actualRevenue, actualExpense] of [[0, 1200, 700], [1, 800, 900]] as const) {
      const date = new Date(Date.UTC(YEAR, monthIndex, 15));
      const incomeEntry = await createEntry({
        date,
        description: `[test] รายได้จริงเดือน ${monthIndex + 1}`,
        status: "POSTED",
        lines: [{ accountId: cash.id, debit: actualRevenue }, { accountId: revenue.id, credit: actualRevenue }],
      });
      const expenseEntry = await createEntry({
        date,
        description: `[test] ค่าใช้จ่ายจริงเดือน ${monthIndex + 1}`,
        status: "POSTED",
        lines: [{ accountId: expense.id, debit: actualExpense }, { accountId: cash.id, credit: actualExpense }],
      });
      entryIds.push(incomeEntry.id, expenseEntry.id);
      const period = await prisma.accPeriod.findUniqueOrThrow({ where: { year_month: { year: YEAR, month: monthIndex + 1 } } });
      periodIds.push(period.id);
    }

    for (const [month, estimatedRevenue, estimatedExpense] of [[1, 1000, 600], [2, 1000, 800]] as const) {
      const projection = await prisma.accFinancialProjection.create({ data: { year: YEAR, month, estimatedRevenue, estimatedExpense } });
      projectionIds.push(projection.id);
    }
    for (const [lossYear, amount] of [[YEAR - 5, 100], [YEAR - 1, 50]] as const) {
      const loss = await prisma.accTaxLossCarryforward.create({ data: { reportYear: YEAR, lossYear, amount } });
      lossIds.push(loss.id);
    }

    const report = await loadProjectionReport(YEAR);
    console.log("\n=== ประมาณการเทียบผลจริง ===");
    check("มกราคม: รายได้ประมาณการ", report.months[0].estimatedRevenue, 100_000);
    check("มกราคม: รายได้จริงจากใบสำคัญ POSTED", report.months[0].actualRevenue, 120_000);
    check("มกราคม: ค่าใช้จ่ายจริง", report.months[0].actualExpense, 70_000);
    check("กุมภาพันธ์: ผลจริงขาดทุน", report.months[1].actualBalance, -10_000);
    check("ประมาณการคงเหลือทั้งปี", report.totals.estimatedBalance, 60_000);
    check("ผลจริงคงเหลือทั้งปี", report.totals.actualBalance, 40_000);
    check("ขาดทุนยกมารวม 5 ปี", report.totalLossAvailable, 15_000);
    check("ประมาณการหลังหักขาดทุนยกมา", report.totals.estimatedAfterLoss, 45_000);
    check("ผลจริงหลังหักขาดทุนยกมา", report.totals.actualAfterLoss, 25_000);
  } finally {
    console.log("\n=== ลบข้อมูลทดสอบตาม id ===");
    for (const id of entryIds.reverse()) await prisma.accJournalEntry.delete({ where: { id } }).catch(() => undefined);
    for (const id of projectionIds.reverse()) await prisma.accFinancialProjection.delete({ where: { id } }).catch(() => undefined);
    for (const id of lossIds.reverse()) await prisma.accTaxLossCarryforward.delete({ where: { id } }).catch(() => undefined);
    for (const id of accountIds.reverse()) await prisma.accAccount.delete({ where: { id } }).catch(() => undefined);
    for (const id of periodIds.reverse()) await prisma.accPeriod.delete({ where: { id } }).catch(() => undefined);
    await prisma.$disconnect();
  }

  console.log(fails === 0 ? "\n✅ ผ่านทั้งหมด\n" : `\n❌ ไม่ผ่าน ${fails} ข้อ\n`);
  process.exit(fails === 0 ? 0 : 1);
}

main();
