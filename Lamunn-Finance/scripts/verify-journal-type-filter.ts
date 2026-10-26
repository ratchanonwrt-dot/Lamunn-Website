/** พิสูจน์ Dropdown ประเภทสมุดรายวันด้วยข้อมูลปีอนาคต แล้วลบเฉพาะ ID ที่สร้างเอง
 * รัน: npx tsx scripts/verify-journal-type-filter.ts
 */
import { prisma, type AccJournalType } from "@lamunn/db-finance";
import { createEntry } from "../src/lib/accounting/post";
import { isJournalType, JOURNAL_TYPE_OPTIONS } from "../src/lib/accounting/journalTypes";

const YEAR = 2098;
let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? "ผ่าน  " : "ไม่ผ่าน ❌"}  ${label}${ok ? "" : ` (ได้ ${JSON.stringify(actual)} ควรเป็น ${JSON.stringify(expected)})`}`);
  if (!ok) failures++;
}

async function main() {
  const entryIds: string[] = [];
  const accountIds: string[] = [];
  let createdPeriodId: string | null = null;
  try {
    const periodBefore = await prisma.accPeriod.findUnique({ where: { year_month: { year: YEAR, month: 1 } } });
    const stamp = Date.now();
    const debitAccount = await prisma.accAccount.create({
      data: { code: `TEST-JOURNAL-D-${stamp}`, nameTh: "[test] บัญชีเดบิต", type: "ASSET" },
    });
    const creditAccount = await prisma.accAccount.create({
      data: { code: `TEST-JOURNAL-C-${stamp}`, nameTh: "[test] บัญชีเครดิต", type: "REVENUE" },
    });
    accountIds.push(debitAccount.id, creditAccount.id);

    for (const [index, journalType] of (["GENERAL", "PURCHASE", "PAYMENT"] as AccJournalType[]).entries()) {
      const entry = await createEntry({
        date: new Date(Date.UTC(YEAR, 0, 10 + index)),
        journalType,
        status: "POSTED",
        description: `[test] ${journalType}`,
        lines: [
          { accountId: debitAccount.id, debit: 100 + index },
          { accountId: creditAccount.id, credit: 100 + index },
        ],
      });
      entryIds.push(entry.id);
    }

    const periodAfter = await prisma.accPeriod.findUnique({ where: { year_month: { year: YEAR, month: 1 } } });
    if (!periodBefore) createdPeriodId = periodAfter?.id ?? null;

    const purchaseEntries = await prisma.accJournalEntry.findMany({
      where: { id: { in: entryIds }, journalType: "PURCHASE" },
      select: { journalType: true, description: true },
    });

    console.log("\n=== Dropdown ประเภทสมุดรายวัน ===");
    check("มีตัวเลือกครบ 7 ประเภท", JOURNAL_TYPE_OPTIONS.length, 7);
    check("ยอมรับประเภทที่ระบบรองรับ", isJournalType("PAYMENT"), true);
    check("ปฏิเสธค่าที่ไม่ใช่ประเภทสมุดรายวัน", isJournalType("UNKNOWN"), false);
    check("กรองสมุดรายวันซื้อได้เฉพาะรายการที่ต้องการ", purchaseEntries, [
      { journalType: "PURCHASE", description: "[test] PURCHASE" },
    ]);
  } finally {
    console.log("\n=== ลบเฉพาะข้อมูลทดสอบที่สร้างครั้งนี้ ===");
    for (const id of entryIds.reverse()) await prisma.accJournalEntry.delete({ where: { id } }).catch(() => undefined);
    for (const id of accountIds.reverse()) await prisma.accAccount.delete({ where: { id } }).catch(() => undefined);
    if (createdPeriodId) await prisma.accPeriod.delete({ where: { id: createdPeriodId } }).catch(() => undefined);
  }

  console.log(failures === 0 ? "\n✅ ผ่านทั้งหมด\n" : `\n❌ ไม่ผ่าน ${failures} ข้อ\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
