/** พิสูจน์รูปแบบชื่อคู่ค้าและสาขาที่ใช้ร่วมกันทุกหน้าบัญชี
 *
 * รัน: npx tsx scripts/verify-partner-branch-label.ts
 */
import { formatPartnerDisplayName } from "../src/lib/accounting/partnerDisplay";

function check(actual: string, expected: string) {
  if (actual !== expected) throw new Error(`คาดว่า "${expected}" แต่ได้ "${actual}"`);
}

check(
  formatPartnerDisplayName("บริษัท เซ็นทรัลพัฒนา จำกัด (มหาชน)", "00014"),
  "บริษัท เซ็นทรัลพัฒนา จำกัด (มหาชน) (สาขา 00014)",
);
check(formatPartnerDisplayName("[test] บริษัท ก จำกัด", "สาขา 00001"), "[test] บริษัท ก จำกัด (สาขา 00001)");
check(formatPartnerDisplayName("[test] บริษัท ข จำกัด", "สำนักงานใหญ่"), "[test] บริษัท ข จำกัด (สำนักงานใหญ่)");
check(formatPartnerDisplayName("[test] บริษัท ค จำกัด", null), "[test] บริษัท ค จำกัด");
check(formatPartnerDisplayName("[test] บริษัท ง จำกัด (สาขา 00002)", "00002"), "[test] บริษัท ง จำกัด (สาขา 00002)");

console.log("✅ ชื่อคู่ค้าแสดงสาขาต่อท้ายถูกต้องและไม่ซ้ำ");
