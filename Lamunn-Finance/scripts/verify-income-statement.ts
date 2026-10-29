/** พิสูจน์การจัดหมวดและสูตรของงบกำไรขาดทุน รวมถึงการแยกต้นทุนทางการเงินออกจากภาษีเงินได้
 *
 * สร้างข้อมูลปี ค.ศ. 2096 ผ่าน createEntry เท่านั้น และลบเฉพาะ id ที่สคริปต์สร้างใน finally
 * รัน: npx tsx scripts/verify-income-statement.ts (จากโฟลเดอร์ Lamunn-Finance)
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const YEAR = 2096;
let fails = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? "ผ่าน  " : "ไม่ผ่าน ❌"}  ${label}${ok ? "" : ` (ได้ ${JSON.stringify(actual)} ควรเป็น ${JSON.stringify(expected)})`}`);
  if (!ok) fails++;
}

async function main() {
  const [{ prisma }, { createEntry }, { loadBalances, buildIncomeStatement }] = await Promise.all([
    import("@lamunn/db-finance"),
    import("../src/lib/accounting/post"),
    import("../src/lib/accounting/reports"),
  ]);
  const accountIds: string[] = [];
  const entryIds: string[] = [];
  let createdPeriodId: string | null = null;

  try {
    const existingPeriod = await prisma.accPeriod.findUnique({ where: { year_month: { year: YEAR, month: 1 } } });
    const stamp = Date.now().toString(36).toUpperCase();
    const accountData = [
      { key: "cash", code: `[test]-IS-${stamp}-1110`, nameTh: "[test] เงินสด", type: "ASSET" as const, parentCode: "1100" },
      { key: "revenue", code: `[test]-IS-${stamp}-4110`, nameTh: "[test] รายได้จากการขาย", type: "REVENUE" as const, parentCode: "4000" },
      { key: "otherIncome", code: `[test]-IS-${stamp}-4910`, nameTh: "[test] รายได้อื่น", type: "REVENUE" as const, parentCode: "4900" },
      { key: "cogs", code: `[test]-IS-${stamp}-5110`, nameTh: "[test] ต้นทุนขาย", type: "EXPENSE" as const, parentCode: "5100" },
      { key: "selling", code: `[test]-IS-${stamp}-5310`, nameTh: "[test] ค่าใช้จ่ายขาย", type: "EXPENSE" as const, parentCode: "5300" },
      { key: "admin", code: `[test]-IS-${stamp}-5410`, nameTh: "[test] ค่าใช้จ่ายบริหาร", type: "EXPENSE" as const, parentCode: "5400" },
      { key: "finance", code: `5910-${stamp}`, nameTh: "[test] ต้นทุนทางการเงิน", type: "EXPENSE" as const, parentCode: "5900" },
      { key: "tax", code: `5920-${stamp}`, nameTh: "[test] ภาษีเงินได้", type: "EXPENSE" as const, parentCode: "5900" },
    ];
    const accounts: Record<string, { id: string; code: string }> = {};

    for (const data of accountData) {
      const account = await prisma.accAccount.create({
        data: { code: data.code, nameTh: data.nameTh, type: data.type, parentCode: data.parentCode },
      });
      accountIds.push(account.id);
      accounts[data.key] = account;
    }

    const date = new Date(Date.UTC(YEAR, 0, 15));
    const revenueEntry = await createEntry({
      date,
      journalType: "GENERAL",
      description: "[test] รายได้สำหรับพิสูจน์งบกำไรขาดทุน",
      status: "POSTED",
      lines: [
        { accountId: accounts.cash.id, debit: 105000 },
        { accountId: accounts.revenue.id, credit: 100000 },
        { accountId: accounts.otherIncome.id, credit: 5000 },
      ],
    });
    entryIds.push(revenueEntry.id);

    const expenseEntry = await createEntry({
      date,
      journalType: "GENERAL",
      description: "[test] ค่าใช้จ่ายสำหรับพิสูจน์งบกำไรขาดทุน",
      status: "POSTED",
      lines: [
        { accountId: accounts.cogs.id, debit: 30000 },
        { accountId: accounts.selling.id, debit: 10000 },
        { accountId: accounts.admin.id, debit: 15000 },
        { accountId: accounts.finance.id, debit: 2000 },
        { accountId: accounts.tax.id, debit: 3000 },
        { accountId: accounts.cash.id, credit: 60000 },
      ],
    });
    entryIds.push(expenseEntry.id);

    if (!existingPeriod) {
      createdPeriodId = (await prisma.accPeriod.findUniqueOrThrow({ where: { year_month: { year: YEAR, month: 1 } } })).id;
    }

    const balances = await loadBalances({
      from: new Date(Date.UTC(YEAR, 0, 1)),
      to: new Date(Date.UTC(YEAR, 0, 31, 23, 59, 59, 999)),
    });
    const report = buildIncomeStatement(balances);

    console.log("\n=== งบกำไรขาดทุนแบบจัดหมวด ===");
    check("รายได้จากการขายและบริการ", report.revenue.total, 10_000_000);
    check("รายได้อื่น", report.otherIncome.total, 500_000);
    check("รวมรายได้", report.totalRevenue, 10_500_000);
    check("รวมค่าใช้จ่าย (ไม่รวมต้นทุนทางการเงินและภาษี)", report.totalExpenses, 5_500_000);
    check("กำไรก่อนต้นทุนทางการเงินและภาษีเงินได้", report.operatingProfit, 5_000_000);
    check("ต้นทุนทางการเงิน", report.financeCost.total, 200_000);
    check("กำไรก่อนภาษีเงินได้", report.profitBeforeTax, 4_800_000);
    check("ภาษีเงินได้", report.incomeTax.total, 300_000);
    check("กำไรสุทธิ", report.netProfit, 4_500_000);
    check("บัญชี 5910 อยู่เฉพาะต้นทุนทางการเงิน", report.financeCost.lines.map((line) => line.code), [accounts.finance.code]);
    check("บัญชี 5920 อยู่เฉพาะภาษีเงินได้", report.incomeTax.lines.map((line) => line.code), [accounts.tax.code]);
  } finally {
    console.log("\n=== ลบข้อมูลทดสอบตาม id ===");
    for (const id of entryIds.reverse()) {
      await prisma.accJournalEntry.delete({ where: { id } }).catch(() => undefined);
    }
    for (const id of accountIds.reverse()) {
      await prisma.accAccount.delete({ where: { id } }).catch(() => undefined);
    }
    if (createdPeriodId) {
      await prisma.accPeriod.delete({ where: { id: createdPeriodId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }

  console.log(fails === 0 ? "\n✅ ผ่านทั้งหมด\n" : `\n❌ ไม่ผ่าน ${fails} ข้อ\n`);
  process.exit(fails === 0 ? 0 : 1);
}

main();
