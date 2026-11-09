/** พิสูจน์ว่า API หน้าแก้ไขภาษีซื้อไม่สลับรายชื่อคู่ค้ากับบัญชีที่ใช้จ่าย
 *
 * สคริปต์นี้ตรวจโครงสร้าง API โดยไม่สร้างหรือแก้ข้อมูลในฐานข้อมูล
 * รัน: npx tsx scripts/verify-input-vat-edit-options.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/api/accounting/purchase-tax-invoices/[id]/route.ts"), "utf8");

assert.match(
  source,
  /const \[expenseAccounts, partners, paymentAccounts\] = await Promise\.all\(\[/,
  "ผลลัพธ์ Promise.all ต้องเรียงเป็นบัญชีค่าใช้จ่าย คู่ค้า และบัญชีจ่าย",
);
assert.match(
  source,
  /formOptions: \{ expenseAccounts, paymentAccounts, partners \}/,
  "API ต้องส่ง formOptions ด้วยชื่อที่หน้าจอแก้ไขใช้งาน",
);
assert.doesNotMatch(
  source,
  /const \[expenseAccounts, paymentAccounts, partners\] = await Promise\.all\(\[/,
  "ห้ามสลับคู่ค้ากับบัญชีจ่าย เพราะ PartnerCombobox จะล้มเมื่ออ่านชื่อคู่ค้า",
);

console.log("✅ ตัวเลือกหน้าแก้ไขภาษีซื้อเรียงคู่ค้าและบัญชีจ่ายถูกต้อง");
