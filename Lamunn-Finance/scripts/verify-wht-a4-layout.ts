/** พิสูจน์ว่าหน้าพิมพ์ 50 ทวิยังคงเป็นแบบเต็ม A4 และมีส่วนสำคัญตามแบบกรมสรรพากร
 *
 * สคริปต์นี้ตรวจโครงหน้าพิมพ์โดยไม่สร้างหรือแก้ข้อมูลในฐานข้อมูล
 * รัน: npx tsx scripts/verify-wht-a4-layout.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/print/wht/[id]/page.tsx"), "utf8");

assert.match(source, /@page \{ size: A4 portrait; margin: 0; \}/, "ต้องกำหนดกระดาษ A4 แนวตั้ง");
assert.match(source, /width: 210mm/, "ต้องกำหนดความกว้างเต็ม A4");
assert.match(source, /height: 297mm/, "ต้องกำหนดความสูงเต็ม A4 ตอนพิมพ์");
assert.match(source, /หนังสือรับรองการหักภาษี ณ ที่จ่าย/, "ต้องมีหัวหนังสือรับรอง");
assert.match(source, /เลขประจำตัวผู้เสียภาษีอากร \(13 หลัก\)\*/, "ต้องมีช่องเลขผู้เสียภาษี 13 หลัก");
assert.match(source, /wht-income-table/, "ต้องมีตารางประเภทเงินได้เต็มหน้า");
assert.match(source, /คำเตือน/, "ต้องมีกรอบคำเตือน");
assert.match(source, /ลงชื่อ/, "ต้องมีพื้นที่ลงชื่อผู้จ่ายเงิน");
assert.doesNotMatch(source, /transform:\s*scale/, "ห้ามย่อแบบฟอร์มด้วย scale เพราะจะไม่เต็ม A4");

console.log("✅ แบบหนังสือรับรอง 50 ทวิเป็น A4 เต็มหน้าและมีส่วนสำคัญครบ");
