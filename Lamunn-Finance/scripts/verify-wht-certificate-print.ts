/** พิสูจน์ว่าหนังสือรับรอง 50 ทวิข้อ 6 ไม่พิมพ์ ม.40(8) ซ้ำ โดยไม่แก้ประเภทเงินได้ต้นฉบับ
 *
 * สคริปต์นี้ตรวจ pure function จึงไม่สร้างหรือแก้ข้อมูลในฐานข้อมูล
 * รัน: npx tsx scripts/verify-wht-certificate-print.ts
 */
import assert from "node:assert/strict";
import { formatWhtOtherIncomeType } from "../src/lib/accounting/whtCertificatePrint";

const original = "ค่าบริการอื่น ๆ ม.40(8)";

assert.equal(formatWhtOtherIncomeType(original), "ค่าบริการอื่น ๆ");
assert.equal(original, "ค่าบริการอื่น ๆ ม.40(8)", "ต้องไม่แก้ข้อมูลประเภทเงินได้ต้นฉบับ");
assert.equal(formatWhtOtherIncomeType("ค่าเช่า"), "ค่าเช่า", "ประเภทที่ไม่มีมาตราต่อท้ายต้องคงเดิม");

console.log("✅ verify-wht-certificate-print ผ่านทั้งหมด");
