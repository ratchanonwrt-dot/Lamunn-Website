import { formatAccountingDate } from "../src/lib/accounting/dateFormat";

let fails = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  console.log(`  ${ok ? "ผ่าน  " : "ไม่ผ่าน ❌"}  ${label}${ok ? "" : ` (ได้ ${String(actual)} ควรเป็น ${String(expected)})`}`);
  if (!ok) fails++;
}

console.log("\n=== รูปแบบวันที่ระบบบัญชี ===");
check("ข้อความ ISO เปลี่ยนเป็น วัน/เดือน/ปี พ.ศ.", formatAccountingDate("2026-10-05"), "5/10/2569");
check("วันที่จากฐานข้อมูลเปลี่ยนเป็น วัน/เดือน/ปี พ.ศ.", formatAccountingDate(new Date(Date.UTC(2091, 0, 9))), "9/1/2634");
check("ค่าว่างแสดงขีด", formatAccountingDate(null), "—");
console.log(fails === 0 ? "\n✅ ผ่านทั้งหมด\n" : `\n❌ ไม่ผ่าน ${fails} ข้อ\n`);
process.exit(fails === 0 ? 0 : 1);
