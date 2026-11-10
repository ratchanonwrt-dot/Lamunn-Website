/** พิสูจน์ว่าหนังสือรับรอง 50 ทวิข้อ 6 ไม่พิมพ์ ม.40(8) ซ้ำ โดยไม่แก้ประเภทเงินได้ต้นฉบับ
 *
 * สคริปต์นี้ตรวจ pure function จึงไม่สร้างหรือแก้ข้อมูลในฐานข้อมูล
 * รัน: npx tsx scripts/verify-wht-certificate-print.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { formatWhtOtherIncomeType } from "../src/lib/accounting/whtCertificatePrint";
import { formatPartnerDisplayName } from "../src/lib/accounting/partnerDisplay";

const original = "ค่าบริการอื่น ๆ ม.40(8)";

assert.equal(formatWhtOtherIncomeType(original), "ค่าบริการอื่น ๆ");
assert.equal(original, "ค่าบริการอื่น ๆ ม.40(8)", "ต้องไม่แก้ข้อมูลประเภทเงินได้ต้นฉบับ");
assert.equal(formatWhtOtherIncomeType("ค่าเช่า"), "ค่าเช่า", "ประเภทที่ไม่มีมาตราต่อท้ายต้องคงเดิม");
assert.equal(formatPartnerDisplayName("[test] ผู้ถูกหัก ภ.ง.ด.3", ""), "[test] ผู้ถูกหัก ภ.ง.ด.3", "ภ.ง.ด.3 ที่ไม่ได้ระบุสาขาต้องแสดงเฉพาะชื่อ");

const pageSource = readFileSync(path.join(process.cwd(), "src", "app", "print", "wht", "[id]", "page.tsx"), "utf8");
const formSource = readFileSync(path.join(process.cwd(), "src", "components", "accounting", "WhtCertificateForm.tsx"), "utf8");
assert.match(pageSource, /@page \{ size: A4 portrait; margin: 0; \}/, "หน้าพิมพ์ต้องกำหนดเป็น A4 แนวตั้ง");
assert.match(pageSource, /\.wht-form \{[^}]*height: 264mm;[^}]*display: flex;/, "ตัวแบบต้องขยายเต็มพื้นที่พิมพ์ A4");
assert.match(pageSource, /\.wht-income-table \{[^}]*flex: 1 1 auto;/, "ตารางต้องยืดใช้พื้นที่ว่าง ไม่กองอยู่ครึ่งบน");
assert.match(pageSource, /\.wht-signature \{ min-height: 39mm; \}/, "ช่องรับรองและลงนามต้องมีพื้นที่ตามแบบเต็มหน้า");
assert.match(formSource, /payeeBranchTag: ""/, "ถ้าไม่ได้กรอกสาขา หนังสือรับรองต้องไม่เติมสำนักงานใหญ่ให้อัตโนมัติ");

console.log("✅ verify-wht-certificate-print ผ่านทั้งหมด");
