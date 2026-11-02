/** พิสูจน์ว่า Excel ประมาณการแสดงตัวเลขประมาณการเทียบผลจริงครบ 12 เดือนและยอดรวมถูกต้อง
 *
 * ใช้ข้อมูลจำลองปี ค.ศ. 2099 โดยไม่เขียนฐานข้อมูล จึงไม่มีข้อมูลที่ต้องลบ
 * รัน: npx tsx scripts/verify-projection-excel.ts
 */
import type { ProjectionReport } from "../src/lib/accounting/projection";
import { buildProjectionWorkbook, projectionExcelFilename } from "../src/lib/accounting/projectionExcel";

let fails = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? "ผ่าน  " : "ไม่ผ่าน ❌"}  ${label}${ok ? "" : ` (ได้ ${JSON.stringify(actual)} ควรเป็น ${JSON.stringify(expected)})`}`);
  if (!ok) fails++;
}

async function main() {
  const months = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    estimatedRevenue: (index + 1) * 100_000,
    actualRevenue: (index + 1) * 110_000,
    estimatedExpense: (index + 1) * 60_000,
    actualExpense: (index + 1) * 70_000,
    estimatedBalance: (index + 1) * 40_000,
    actualBalance: (index + 1) * 40_000,
  }));
  const report: ProjectionReport = {
    year: 2099,
    months,
    losses: Array.from({ length: 5 }, (_, index) => ({ lossYear: 2094 + index, amount: 10_000 })),
    totalLossAvailable: 50_000,
    totals: {
      estimatedRevenue: 7_800_000,
      actualRevenue: 8_580_000,
      estimatedExpense: 4_680_000,
      actualExpense: 5_460_000,
      estimatedBalance: 3_120_000,
      actualBalance: 3_120_000,
      estimatedLossDeducted: 50_000,
      actualLossDeducted: 50_000,
      estimatedAfterLoss: 3_070_000,
      actualAfterLoss: 3_070_000,
    },
  };

  const workbook = buildProjectionWorkbook(report, "[test] บริษัททดสอบประมาณการ จำกัด");
  const sheet = workbook.getWorksheet("ประมาณการเทียบผลจริง");
  console.log("\n=== Excel ประมาณการเทียบผลจริง ===");
  check("ชื่อบริษัท", sheet?.getCell("A1").value, "[test] บริษัททดสอบประมาณการ จำกัด");
  check("รายได้ประมาณการเดือนมกราคมเป็นบาท", sheet?.getCell("B6").value, 1000);
  check("รายได้จริงเดือนธันวาคมเป็นบาท", sheet?.getCell("Y6").value, 13200);
  check("ยอดรวมหลังหักขาดทุนยกมาเป็นบาท", sheet?.getCell("AA10").value, 30700);
  check("ชื่อไฟล์", projectionExcelFilename(2099), "projection-vs-actual-2099.xlsx");
  check("สร้างไฟล์ได้", (await workbook.xlsx.writeBuffer()).byteLength > 0, true);

  console.log(fails === 0 ? "\n✅ ผ่านทั้งหมด\n" : `\n❌ ไม่ผ่าน ${fails} ข้อ\n`);
  process.exit(fails === 0 ? 0 : 1);
}

main();
