/** พิสูจน์การอ่านและจับคู่รายการกระทบยอดโดยไม่แตะฐานข้อมูลหรือสร้างใบสำคัญ
 * รัน: npx tsx scripts/verify-bank-reconciliation.ts
 */
import { filterReconciliationRows, parseReconciliationTable, reconcileBankRows, summarizeReconciliationRows } from "../src/lib/accounting/bankReconciliation";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? "ผ่าน  " : "ไม่ผ่าน ❌"}  ${label}${ok ? "" : ` (ได้ ${JSON.stringify(actual)} ควรเป็น ${JSON.stringify(expected)})`}`);
  if (!ok) failures++;
}

function main() {
  const sparseHeader: unknown[] = [];
  sparseHeader[1] = "วันที่";
  sparseHeader[3] = "รายละเอียด";
  sparseHeader[5] = "จำนวนเงิน";
  // ใช้ปีอนาคตและชื่อ [test] เพื่อแยกข้อมูลพิสูจน์ออกจากข้อมูลใช้งาน แม้ชุดนี้จะอยู่ในหน่วยความจำเท่านั้น
  const bank = parseReconciliationTable([
    ["วันที่", "รายละเอียด", "เงินเข้า", "เงินออก"],
    ["01/01/2637", "[test] รับโอน", "1,250.50", 0],
    ["02/01/2637", "[test] ค่าธรรมเนียม", 0, "15.00"],
    ["03/01/2637", "[test] รายการค้าง", "300.00", ""],
  ], "bank");
  const ledger = parseReconciliationTable([
    ["Date", "Description", "Debit", "Credit"],
    ["2094-01-01", "[test] รับโอนเข้าบัญชี", 1250.5, 0],
    ["2094-01-02", "[test] ค่าธรรมเนียมธนาคาร", 0, 15],
    ["2094-01-04", "[test] รายการเฉพาะบัญชี", 99, ""],
  ], "ledger");
  const bankDebitCredit = parseReconciliationTable([
    ["วันที่", "รายละเอียด", "เดบิต", "เครดิต"],
    ["05/01/2094", "[test] เงินเข้าจากเดบิต", 700, 0],
    ["06/01/2094", "[test] เงินออกจากเครดิต", 0, 80],
  ], "bank");
  const incomingResult = reconcileBankRows(bank, ledger, "in");
  const outgoingResult = reconcileBankRows(bank, ledger, "out");
  const allResult = reconcileBankRows(bank, ledger, "both");
  const sparse = parseReconciliationTable([
    sparseHeader,
    [null, "05/01/2094", null, "[test] เว้นคอลัมน์", null, "500.00"],
  ], "bank");
  const duplicateBank = parseReconciliationTable([
    ["วันที่", "รายการ", "เงินออก", "รายละเอียด"],
    ["10/01/2094", "โอนเงิน", 500, "โอนไป KTB น.ส. ดารณี เพชรพัน++"],
    ["10/01/2094", "โอนเงิน", 500, "โอนไป KTB น.ส. ดารณี เพชรพัน++"],
    ["10/01/2094", "โอนเงิน", 10700, "โอนไป BBL บจ.สรรพสินค้าเซ็นท++"],
  ], "bank");
  const duplicateLedger = parseReconciliationTable([
    ["วันที่", "รายการ", "สาขา/คู่ค้า", "เดบิต", "เครดิต"],
    ["10/01/2094", "[test] ค่าจ้างไลฟ์", "นางสาว ดารณี เพชรพันธ์", 0, 500],
    ["10/01/2094", "[test] ค่าจ้างไลฟ์", "นางสาว ดารณี เพชรพันธ์", 0, 500],
    ["10/01/2094", "[test] ค่าจ้างไลฟ์", "นางสาว ปาณิศา อัตถากร", 0, 500],
    ["11/01/2094", "[test] เงินประกันเซ็นทรัล", "บริษัท สรรพสินค้าเซ็นทรัล จำกัด", 0, 10700],
  ], "ledger");
  const duplicateResult = reconcileBankRows(duplicateBank, duplicateLedger);
  const statusBank = parseReconciliationTable([
    ["วันที่", "รายละเอียด", "จำนวนเงิน"],
    ["01/02/2094", "[test] ค่าเช่า เซ็นทรัล", 100],
    ["02/02/2094", "[test] ค่าธรรมเนียมธนาคาร", 200],
    ["03/02/2094", "[test] ยอดขายหน้าร้าน", 300],
    ["10/02/2094", "[test] ไม่พบในบัญชี", 400],
  ], "bank");
  const statusLedger = parseReconciliationTable([
    ["วันที่", "รายละเอียด", "จำนวนเงิน"],
    ["01/02/2094", "[test] ค่าเช่า เซ็นทรัล สาขา", 100],
    ["02/02/2094", "[test] ค่าธรรมเนียมธนาคาร", 250],
    ["03/02/2094", "[test] ซื้อวัตถุดิบ", 300],
  ], "ledger");
  const statusResult = reconcileBankRows(statusBank, statusLedger);
  const statusSummary = summarizeReconciliationRows(statusResult);

  console.log("\n=== อ่านไฟล์เป็นสตางค์ ===");
  check("เงินเข้าธนาคารเป็นบวก", bank[0].amount, 125_050);
  check("เงินออกธนาคารเป็นลบ", bank[1].amount, -1_500);
  check("เครดิตบัญชีเงินฝากเป็นลบ", ledger[1].amount, -1_500);
  check("เดบิตไฟล์ธนาคารเป็นเงินเข้า", bankDebitCredit[0].amount, 70_000);
  check("เครดิตไฟล์ธนาคารเป็นเงินออก", bankDebitCredit[1].amount, -8_000);
  check("อ่านหัวตารางที่มีคอลัมน์ว่างคั่นได้", sparse[0].amount, 50_000);

  console.log("\n=== จับคู่ด้วยยอดและคำอธิบาย ===");
  check("เลือกเงินเข้าจับคู่ได้ 1 รายการ", incomingResult.filter((row) => row.matched).length, 1);
  check("เลือกเงินเข้าไม่แสดงเงินออก", incomingResult.some((row) => (row.bank?.amount ?? row.ledger?.amount ?? 0) < 0), false);
  check("เลือกเงินออกจับคู่ได้ 1 รายการ", outgoingResult.filter((row) => row.matched).length, 1);
  check("เลือกเงินออกไม่แสดงเงินเข้า", outgoingResult.some((row) => (row.bank?.amount ?? row.ledger?.amount ?? 0) > 0), false);
  check("dropdown เงินเข้ารับเดบิตไฟล์ธนาคาร", reconcileBankRows(bankDebitCredit, [], "in").map((row) => row.bank?.amount), [70_000]);
  check("dropdown เงินออกรับเครดิตไฟล์ธนาคาร", reconcileBankRows(bankDebitCredit, [], "out").map((row) => row.bank?.amount), [-8_000]);
  check("เลือกทั้งคู่แสดงรายการครบทั้งสองทิศทาง", allResult.length, 4);
  check("เลือกทั้งคู่จับคู่ได้ 2 รายการ", allResult.filter((row) => row.matched).length, 2);
  check("ยอดซ้ำจับด้วยชื่อคู่ค้าและเหลือคนที่ไม่มีรายการธนาคาร", duplicateResult.filter((row) => !row.matched && row.ledger).map((row) => row.ledger?.detail), ["[test] ค่าจ้างไลฟ์ — นางสาว ปาณิศา อัตถากร"]);
  check("วันที่คลาดหนึ่งวันจับได้เมื่อรายละเอียดสอดคล้อง", duplicateResult.filter((row) => row.matchKind === "near-date").map((row) => row.ledger?.amount), [-1_070_000]);

  console.log("\n=== สีสถานะและผลต่าง ===");
  check("ยอดและคำสำคัญตรงกันเป็นสีเขียว", statusResult.filter((row) => row.status === "matched").length, 1);
  check("แสดงคำที่ตรงกันไม่เกิน 3 คำ", statusResult.find((row) => row.status === "matched")?.commonWords, ["ค่าเช่า", "เซ็นทรัล"]);
  check("ยอดต่างแต่รายละเอียดตรงเป็นสีแดง", statusResult.some((row) => row.matchKind === "amount-mismatch" && row.status === "mismatched"), true);
  check("ยอดตรงแต่รายละเอียดต่างเป็นสีแดง", statusResult.some((row) => row.matchKind === "detail-mismatch" && row.status === "mismatched"), true);
  check("ไม่มีคู่เป็นสีเหลือง", statusResult.filter((row) => row.status === "not-found").length, 1);
  check("สรุปจำนวนแต่ละสถานะ", [statusSummary.matchedCount, statusSummary.mismatchedCount, statusSummary.notFoundCount], [1, 2, 1]);
  check("สรุปผลต่างเงินเข้าเป็นสตางค์", statusSummary.inDifference, 35_000);
  check("กรองเฉพาะรายการตรงกัน", filterReconciliationRows(statusResult, "matched").map((row) => row.status), ["matched"]);
  check("กรองเฉพาะรายการไม่ตรงกัน", filterReconciliationRows(statusResult, "mismatched").map((row) => row.status), ["mismatched", "mismatched"]);
  check("กรองเฉพาะรายการไม่พบคู่", filterReconciliationRows(statusResult, "not-found").map((row) => row.status), ["not-found"]);
  check("เลือกทั้งหมดไม่ตัดรายการ", filterReconciliationRows(statusResult, "all").length, statusResult.length);

  console.log("\n=== ล้างข้อมูลทดสอบ ===");
  bank.length = 0;
  ledger.length = 0;
  bankDebitCredit.length = 0;
  incomingResult.length = 0;
  outgoingResult.length = 0;
  allResult.length = 0;
  sparse.length = 0;
  duplicateBank.length = 0;
  duplicateLedger.length = 0;
  duplicateResult.length = 0;
  statusBank.length = 0;
  statusLedger.length = 0;
  statusResult.length = 0;
  check("ข้อมูลในหน่วยความจำถูกล้าง", [bank.length, ledger.length, bankDebitCredit.length, incomingResult.length, outgoingResult.length, allResult.length, sparse.length, duplicateBank.length, duplicateLedger.length, duplicateResult.length, statusBank.length, statusLedger.length, statusResult.length], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

  console.log(failures === 0 ? "\n✅ ผ่านทั้งหมด\n" : `\n❌ ไม่ผ่าน ${failures} ข้อ\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
