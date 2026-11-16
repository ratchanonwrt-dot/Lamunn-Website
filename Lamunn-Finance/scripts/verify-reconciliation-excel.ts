/** พิสูจน์ไฟล์ Excel ผลการกระทบยอดทั้งบัญชีและแพลตฟอร์มโดยไม่แตะฐานข้อมูล
 * รัน: npx tsx scripts/verify-reconciliation-excel.ts
 */
import type { ReconciliationResultRow } from "../src/lib/accounting/bankReconciliation";
import type { PlatformReconciliationResult } from "../src/lib/accounting/platformBankReconciliation";
import {
  buildBankReconciliationWorkbook,
  buildPlatformReconciliationWorkbook,
} from "../src/lib/accounting/reconciliationExcel";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? "ผ่าน  " : "ไม่ผ่าน ❌"}  ${label}${ok ? "" : ` (ได้ ${JSON.stringify(actual)} ควรเป็น ${JSON.stringify(expected)})`}`);
  if (!ok) failures++;
}

const bankRows: ReconciliationResultRow[] = [{
  id: "[test]-bank-1",
  dateKey: "2090-01-05",
  dateLabel: "05/01/2633",
  bank: { rowNumber: 1, dateKey: "2090-01-05", dateLabel: "05/01/2633", detail: "[test] รับเงิน LINE MAN", amount: 10_000 },
  ledger: { rowNumber: 1, dateKey: "2090-01-05", dateLabel: "05/01/2633", detail: "[test] LINE MAN", amount: 9_900 },
  status: "mismatched",
  matched: false,
  matchKind: "amount-mismatch",
  daysApart: 0,
  commonWords: ["line", "man"],
  amountDifference: 100,
}];

const platformRows: PlatformReconciliationResult[] = [{
  id: "[test]-platform-1",
  dateKey: "2090-01-05",
  dateLabel: "05/01/2633",
  bank: { rowNumber: 1, dateKey: "2090-01-05", dateLabel: "05/01/2633", detail: "[test] รับเงิน LINE MAN", amount: 9_500 },
  payouts: [{
    id: "[test]-payout-1",
    platform: "LINE_MAN",
    sourceName: "[test]-line-man.pdf",
    rowNumber: 1,
    dateKey: "2090-01-05",
    dateLabel: "05/01/2633",
    storeId: "[test]-store",
    storeName: "[test] สาขา A",
    reference: "[test]-ref",
    detail: "[test] LINE MAN",
    grossAmount: 12_000,
    feeAmount: 2_000,
    adjustmentAmount: 0,
    payoutAmount: 10_000,
  }],
  platformTotal: 10_000,
  inferredTransferFee: 500,
  bankExpected: 9_500,
  amountDifference: 0,
  daysApart: 0,
  status: "matched",
}];

try {
  console.log("\n=== Excel ผลกระทบยอดธนาคารกับบัญชี ===");
  const bankWorkbook = buildBankReconciliationWorkbook(bankRows, { accountCode: "11122.01", year: 2090, month: 1, statusLabel: "ไม่ตรงกัน" });
  const bankSheet = bankWorkbook.getWorksheet("ผลการกระทบยอด");
  check("สร้างแผ่นงานผลกระทบยอด", Boolean(bankSheet), true);
  check("แสดงรายการธนาคาร", bankSheet?.getCell("B5").value, "[test] รับเงิน LINE MAN");
  check("ยอดธนาคารเป็นตัวเลขบาท", bankSheet?.getCell("D5").value, 100);
  check("ผลต่างเป็นตัวเลขบาท", bankSheet?.getCell("J5").value, 1);
  check("แสดงสถานะยอดไม่ตรงกัน", bankSheet?.getCell("I5").value, "ยอดไม่ตรงกัน");

  console.log("\n=== Excel ผลกระทบยอดแพลตฟอร์มกับธนาคาร ===");
  const platformWorkbook = buildPlatformReconciliationWorkbook(platformRows, { platform: "LINE_MAN", statusLabel: "ทั้งหมด" });
  const platformSheet = platformWorkbook.getWorksheet("ผลกระทบยอดแพลตฟอร์ม");
  check("สร้างแผ่นงานแพลตฟอร์ม", Boolean(platformSheet), true);
  check("แสดงสาขาและหมายเลขร้าน", platformSheet?.getCell("B5").value, "[test] สาขา A / [test]-store");
  check("ยอดโอนแพลตฟอร์มเป็นตัวเลขบาท", platformSheet?.getCell("D5").value, 100);
  check("ค่าธรรมเนียมเป็นตัวเลขบาท", platformSheet?.getCell("E5").value, 5);
  check("แสดงสถานะตรงกัน", platformSheet?.getCell("J5").value, "ตรงกัน · หักค่าธรรมเนียมโอน 5 บาท");
} finally {
  console.log("\n=== ล้างข้อมูลทดสอบ ===");
  bankRows.length = 0;
  platformRows.length = 0;
  check("ล้างเฉพาะข้อมูลในหน่วยความจำที่สคริปต์สร้าง", [bankRows.length, platformRows.length], [0, 0]);
}

console.log(failures === 0 ? "\n✅ ผ่านทั้งหมด\n" : `\n❌ ไม่ผ่าน ${failures} ข้อ\n`);
process.exit(failures === 0 ? 0 : 1);
