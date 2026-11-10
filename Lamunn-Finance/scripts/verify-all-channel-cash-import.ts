/** พิสูจน์การนำเข้า Cash: อ่านรายวันครบ, รวมสาขาถูก, บันทึกรายงานโดยไม่สร้างใบสำคัญ และลบเฉพาะ id ที่สร้าง */
import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
const YEAR = 2098;
const MONTH = 12;

const grid = [
  ["[test] Cash report"],
  ["Row Labels", "[test] Asoke", "[test] Bangna", "Grand Total"],
  ["1", "1,000.25", "200", "1,200.25"],
  ["2", "(50.25)", "300", "249.75"],
  ["Grand Total", "950", "500", "1,450"],
];

async function pure() {
  const { parseAllChannelCashGrid } = await import("../src/lib/accounting/allChannelCash");
  const parsed = parseAllChannelCashGrid(grid);
  assert.deepEqual(parsed.branches.map((branch) => branch.name), ["[test] Asoke", "[test] Bangna"]);
  assert.deepEqual(parsed.rows.map((row) => row.total), [120_025, 24_975]);
  assert.deepEqual(parsed.branchTotals, [95_000, 50_000]);
  assert.equal(parsed.grandTotal, 145_000);
  console.log("✅ อ่านตารางและคำนวณยอดด้วยสตางค์ถูกต้อง");
  return parsed;
}

async function main() {
  const parsed = await pure();
  if (process.argv.includes("--pure")) return;
  const [{ prisma }, cash] = await Promise.all([
    import("@lamunn/db-finance"),
    import("../src/lib/accounting/allChannelCash"),
  ]);
  const createdIds: string[] = [];
  try {
    const occupied = await prisma.accAllChannelCashDaily.count({ where: { periodYear: YEAR, periodMonth: MONTH } });
    assert.equal(occupied, 0, `งวดทดสอบ ${YEAR}-${MONTH} ต้องว่างเพื่อไม่แตะข้อมูลเดิม`);
    const journalBefore = await prisma.accJournalEntry.count();
    const report = await cash.replaceAllChannelCashReport({
      year: YEAR,
      month: MONTH,
      sourceFile: "[test]-Cash.xlsx",
      createdBy: "[test] verify",
      parsed,
    });
    const records = await prisma.accAllChannelCashDaily.findMany({ where: { periodYear: YEAR, periodMonth: MONTH }, select: { id: true } });
    createdIds.push(...records.map((record) => record.id));
    assert.equal(records.length, 4);
    assert.equal(report.grandTotal, 145_000);
    assert.equal(await prisma.accJournalEntry.count(), journalBefore, "รายงาน Cash ต้องไม่สร้างใบสำคัญ");
    console.log("✅ บันทึกรายงานครบและไม่กระทบสมุดรายวัน");
  } finally {
    for (const id of createdIds.reverse()) await prisma.accAllChannelCashDaily.delete({ where: { id } }).catch(() => undefined);
    await prisma.$disconnect();
    console.log(`✅ ลบข้อมูลทดสอบเฉพาะ ${createdIds.length} id แล้ว`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
