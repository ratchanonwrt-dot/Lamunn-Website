/** พิสูจน์ไฟล์ Excel รายงาน ภ.ง.ด.3/53 โดยไม่แตะฐานข้อมูล */
import type { WhtReport } from "../src/lib/accounting/taxReports";
import { buildWhtWorkbook, whtExcelFilename } from "../src/lib/accounting/whtExcel";

let fails = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "✅" : "❌"} ${label}`);
  if (!ok) {
    console.log(`   ได้ ${JSON.stringify(actual)} ควรเป็น ${JSON.stringify(expected)}`);
    fails++;
  }
}

for (const formType of ["PND3", "PND53"] as const) {
  const report: WhtReport = {
    formType,
    rows: [{
      id: `[test]-${formType}`,
      docNo: `[test]-WHT-209001`,
      payDate: new Date(Date.UTC(2090, 0, 5)),
      payeeName: `[test] ผู้รับเงิน ${formType}`,
      payeeTaxId: "0105568147638",
      payeeBranchTag: "00001",
      incomeType: "[test] ค่าบริการ",
      base: 100000,
      rate: 0.03,
      wht: 3000,
    }],
    totalBase: 100000,
    totalWht: 3000,
    payeeCount: 1,
    glWhtPayable: 3000,
    journalRows: [],
    journalTotal: 0,
  };
  const workbook = buildWhtWorkbook(report, {
    companyName: "[test] บริษัททดสอบ",
    companyTaxId: "0105568147638",
    companyAddress: "[test] ที่อยู่",
    formType,
    year: 2090,
    month: 1,
  });
  const sheet = workbook.getWorksheet(formType)!;
  check(`${formType} ชื่อรายงาน`, sheet.getCell("A2").value, `${formType === "PND3" ? "ภ.ง.ด.3" : "ภ.ง.ด.53"} — ภาษีเงินได้หัก ณ ที่จ่าย`);
  check(`${formType} เลขที่หนังสือรับรอง`, sheet.getCell("C8").value, "[test]-WHT-209001");
  check(`${formType} ฐานภาษีเป็นตัวเลขบาท`, sheet.getCell("G8").value, 1000);
  check(`${formType} ภาษีที่หักเป็นตัวเลขบาท`, sheet.getCell("I8").value, 30);
  check(`${formType} สูตรรวมฐาน`, (sheet.getCell("G9").value as { formula: string }).formula, "SUM(G8:G8)");
  check(`${formType} ชื่อไฟล์`, whtExcelFilename(formType, 2090, 1), `${formType.toLowerCase()}-report-2090-01.xlsx`);
}

if (fails > 0) process.exit(1);
console.log("✅ verify-wht-report-exports ผ่านทั้งหมด");
