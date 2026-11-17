/** พิสูจน์การอ่านรายงานแพลตฟอร์มและจับคู่ยอดรวมกับเงินเข้าธนาคารโดยไม่แตะฐานข้อมูล
 * รัน: npx tsx scripts/verify-platform-bank-reconciliation.ts
 */
import { parseReconciliationTable } from "../src/lib/accounting/bankReconciliation";
import {
  deduplicatePlatformPayouts,
  parseLineManReportText,
  parseGrabReportTable,
  parsePlatformTable,
  parseShopeeReportTable,
  reconcileAllPlatformPayouts,
  reconcilePlatformPayouts,
  summarizePlatformReconciliation,
  type PlatformPayoutItem,
  type PlatformReconciliationResult,
} from "../src/lib/accounting/platformBankReconciliation";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? "ผ่าน  " : "ไม่ผ่าน ❌"}  ${label}${ok ? "" : ` (ได้ ${JSON.stringify(actual)} ควรเป็น ${JSON.stringify(expected)})`}`);
  if (!ok) failures++;
}

const payouts: PlatformPayoutItem[] = [];
const results: PlatformReconciliationResult[] = [];

try {
  const lineManText = `
หมายเลขร้าน test2090A
[test] LINE MAN สาขา A
รายรับทั้งหมด
สรุปรายวัน
วันที่ ยอดขายเงินสด ยอดขาย E-Payment ค่า GP (รวม VAT) ค่าบริการที่ชำระแล้ว ปรับยอด/อื่นๆ ยอดเงินในระบบ ยอดโอนออกให้ร้าน
01/01/2090 0.00 100.00 15.00 15.00 0.00 85.00 85.00
02/01/2090 0.00 200.00 30.00 30.00 0.00 170.00 170.00
[test] LINE MAN สาขา B
หมายเลขร้าน test2090B
รายรับทั้งหมด
สรุปรายวัน
วันที่ ยอดขายเงินสด ยอดขาย E-Payment ค่า GP (รวม VAT) ค่าบริการที่ชำระแล้ว ปรับยอด/อื่นๆ ยอดเงินในระบบ ยอดโอนออกให้ร้าน
01/01/2090 0.00 50.00 7.50 7.50 0.00 42.50 42.50
02/01/2090 0.00 100.00 15.00 15.00 0.00 85.00 85.00
`;
  payouts.push(...parseLineManReportText(lineManText, "[test] line-man.pdf"));

  console.log("\n=== อ่านและทำความสะอาดข้อมูล LINE MAN ===");
  check("อ่านไฟล์รวมสองสาขาได้", payouts.length, 4);
  check("อ่านชื่อสาขาหลังหมายเลขร้าน", payouts[0]?.storeName, "[test] LINE MAN สาขา A");
  check("อ่านชื่อสาขาก่อนหมายเลขร้าน", payouts[2]?.storeName, "[test] LINE MAN สาขา B");
  check("แปลงยอดเป็นสตางค์", payouts.map((row) => row.payoutAmount), [8_500, 17_000, 4_250, 8_500]);
  check("จัดวันที่เป็น พ.ศ.", payouts[0]?.dateLabel, "1/1/2633");

  const generic = parsePlatformTable([
    ["วันที่โอน", "สาขา", "เลขอ้างอิง", "ยอดรับสุทธิ"],
    ["03/01/2090", "[test] Grab A", "[test]-REF-1", "1,234.56"],
  ], "GRAB", "[test] grab.csv");
  check("Excel/CSV รูปแบบกลางอ่านยอดรับสุทธิได้", generic[0]?.payoutAmount, 123_456);

  const grab = parseGrabReportTable([
    ["ชื่อร้าน", "Merchant ID", "ชื่อร้าน", "รหัสร้านค้า", "สถานะ", "รหัสการทำรายการ", "วันที่โอน", "ทั้งหมด"],
    ["[test] บริษัท", "[test]-M", "[test] Grab สาขา A", "[test]-STORE-A", "โอนแล้ว", "[test]-PAYOUT-1", "05/01/2090 04:30", "100.25"],
    ["[test] บริษัท", "[test]-M", "[test] Grab สาขา A", "[test]-STORE-A", "โอนแล้ว", "[test]-PAYOUT-1", "05/01/2090 04:30", "-10.25"],
    ["[test] บริษัท", "[test]-M", "[test] Grab สาขา A", "[test]-STORE-A", "โอนแล้ว", "[test]-PAYOUT-2", "05/01/2090 05:30", "90.00"],
    ["[test] บริษัท", "[test]-M", "[test] Grab สาขา B", "[test]-STORE-B", "ยกเลิก", "[test]-CANCELLED", "", "999.00"],
  ], "[test] grab.csv");
  check("Grab รวมรายการตามรหัสการโอน", grab.map((row) => row.payoutAmount), [9_000, 9_000]);
  check("Grab ใช้ชื่อร้านคอลัมน์สาขาที่อยู่ด้านหลัง", grab[0]?.storeName, "[test] Grab สาขา A");
  check("Grab ไม่นำรายการยกเลิกเข้ากระทบยอด", grab.length, 2);
  check("Grab ไม่ลบรหัสโอนคนละรายการที่ยอดเท่ากัน", deduplicatePlatformPayouts(grab).length, 2);

  const shopee = parseShopeeReportTable([
    ["ชื่อผู้ใช้ (ผู้ขาย)", "จาก", "ถึง"],
    ["[test] lamunn", "2090-01-01", "2090-01-31"],
    ["ยอดรวม (฿)"],
    ["ลำดับที่", "หมายเลขคำสั่งซื้อ", "Shop Name", "วันที่โอนชำระเงินสำเร็จ", "จำนวนเงินทั้งหมดที่โอนแล้ว (฿)"],
    [1, "[test]-ORDER-1", "[test] Shopee A", "05/01/2090", 210],
    [2, "[test]-ORDER-2", "[test] Shopee B", "05/01/2090", -9],
    [3, "[test]-ORDER-3", "[test] Shopee A", "06/01/2090", 300],
  ], "[test] shopee.xlsx");
  check("Shopee รวมยอดบวกและยอดคืนติดลบตามวันที่", shopee.map((row) => row.payoutAmount), [20_100, 30_000]);
  check("Shopee เก็บจำนวนคำสั่งซื้อในเลขอ้างอิง", shopee[0]?.reference, "2 คำสั่งซื้อ");
  const shopeeBankRows = parseReconciliationTable([
    ["วันที่", "รายละเอียด", "เงินเข้า", "เงินออก"],
    ["07/01/2090", "[test] Shopee รวมยอดหลายวัน", "501.00", ""],
  ], "bank");
  const shopeeResults = reconcilePlatformPayouts(shopeeBankRows, shopee, "SHOPEE");
  check("Shopee จับเงินเข้าที่รวมยอดหลายวัน", shopeeResults[0]?.payouts.length, 2);
  check("Shopee รวมยอดหลายวันแล้วตรงกับธนาคาร", shopeeResults[0]?.status, "matched");

  const multiPlatformBank = parseReconciliationTable([
    ["วันที่", "รายละเอียด", "เงินเข้า", "เงินออก"],
    ["05/01/2090", "[test] เงินเข้ารวมไม่ระบุช่องทาง", "100.00", ""],
  ], "bank");
  const competingGrab = parsePlatformTable([
    ["วันที่โอน", "สาขา", "เลขอ้างอิง", "ยอดรับสุทธิ"],
    ["05/01/2090", "[test] Grab", "[test]-GRAB-90", "90.00"],
  ], "GRAB", "[test] grab-generic.csv");
  const exactTikTok = parsePlatformTable([
    ["วันที่โอน", "สาขา", "เลขอ้างอิง", "ยอดรับสุทธิ"],
    ["05/01/2090", "[test] TikTok", "[test]-TIKTOK-100", "100.00"],
  ], "TIKTOK", "[test] tiktok.csv");
  const multiPlatformResults = reconcileAllPlatformPayouts(multiPlatformBank, [...competingGrab, ...exactTikTok]);
  check("หลายแพลตฟอร์มใช้รายการธนาคารเดียวไม่ซ้ำ", multiPlatformResults.filter((row) => row.bank).length, 1);
  check("จับยอดตรงของอีกแพลตฟอร์มก่อนยอดคลาดเคลื่อน", [multiPlatformResults[0]?.payouts[0]?.platform, multiPlatformResults[0]?.status], ["TIKTOK", "matched"]);
  check("แพลตฟอร์มที่ไม่พบเงินเข้ายังคงแสดง", [multiPlatformResults[1]?.payouts[0]?.platform, multiPlatformResults[1]?.status], ["GRAB", "not-found"]);

  const bankRows = parseReconciliationTable([
    ["วันที่", "รายละเอียด", "เงินเข้า", "เงินออก"],
    ["01/01/2090", "[test] LINE MAN รวมสองสาขาวันเดียวกัน", "127.50", ""],
    ["03/01/2090", "[test] LINE MAN หักค่าธรรมเนียมถอน", "250.00", ""],
    ["04/01/2090", "[test] เงินเข้าที่ไม่ระบุแพลตฟอร์ม", "999.00", ""],
  ], "bank");
  results.push(...reconcilePlatformPayouts(bankRows, payouts, "LINE_MAN"));
  const summary = summarizePlatformReconciliation(results);

  console.log("\n=== จับคู่แบบรวมยอดและค่าธรรมเนียมโอน ===");
  check("รวมสองสาขาเป็นเงินเข้าก้อนเดียว", results[0]?.payouts.length, 2);
  check("ยอดหลายสาขาและเงินเข้าวันเดียวกันตรงกัน", [results[0]?.status, results[0]?.daysApart], ["matched", 0]);
  check("ยอดวันที่สองหักค่าธรรมเนียม 5 บาท", results[1]?.inferredTransferFee, 500);
  check("หลังหักค่าธรรมเนียมแล้วยอดตรงกัน", results[1]?.status, "matched");
  check("เงินเข้าที่ไม่ระบุชื่อแพลตฟอร์มและไม่มีต้นทางยังแสดงในผล", [results[2]?.status, results[2]?.bank?.amount, results[2]?.payouts.length], ["not-found", 99_900, 0]);
  check("สรุปแยกธนาคารที่ไม่มีรายการแพลตฟอร์ม", [summary.platformWithoutBankCount, summary.bankWithoutPlatformCount], [0, 1]);
  check("ผลต่างรวมเงินเข้าที่ไม่มีต้นทางแพลตฟอร์ม", summary.difference, 99_900);
} finally {
  console.log("\n=== ล้างข้อมูลทดสอบ ===");
  payouts.length = 0;
  results.length = 0;
  check("ล้างเฉพาะข้อมูลที่สคริปต์สร้าง", [payouts.length, results.length], [0, 0]);
}

console.log(failures === 0 ? "\n✅ ผ่านทั้งหมด\n" : `\n❌ ไม่ผ่าน ${failures} ข้อ\n`);
process.exit(failures === 0 ? 0 : 1);
