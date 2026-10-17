/** พิสูจน์การดึงบัญชีแยกประเภทเข้ากระทบยอดโดยไม่แก้ไขรายการบัญชี
 * รัน: npx tsx scripts/verify-bank-reconciliation-ledger.ts
 */
import { prisma } from "@lamunn/db-finance";
import { createEntry } from "../src/lib/accounting/post";
import { loadLedgerRowsForReconciliation } from "../src/lib/accounting/bankReconciliationLedger";

const YEAR = 2097;
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
    const periodBefore = await prisma.accPeriod.findUnique({ where: { year_month: { year: YEAR, month: 9 } } });
    const bank = await prisma.accAccount.create({ data: { code: `TEST-BANK-${Date.now()}`, nameTh: "[test] เงินฝากธนาคาร", type: "ASSET" } });
    const offset = await prisma.accAccount.create({ data: { code: `TEST-OFFSET-${Date.now()}`, nameTh: "[test] บัญชีคู่", type: "REVENUE" } });
    accountIds.push(bank.id, offset.id);

    const incoming = await createEntry({
      date: new Date(Date.UTC(YEAR, 8, 10)),
      description: "[test] รับเงินลูกค้า",
      status: "POSTED",
      lines: [
        { accountId: bank.id, debit: 1250.5, memo: "[test] เงินเข้า" },
        { accountId: offset.id, credit: 1250.5 },
      ],
    });
    entryIds.push(incoming.id);
    const outgoing = await createEntry({
      date: new Date(Date.UTC(YEAR, 8, 11)),
      description: "[test] จ่ายค่าบริการ",
      status: "POSTED",
      lines: [
        { accountId: offset.id, debit: 80 },
        { accountId: bank.id, credit: 80, memo: "[test] เงินออก" },
      ],
    });
    entryIds.push(outgoing.id);
    const periodAfter = await prisma.accPeriod.findUnique({ where: { year_month: { year: YEAR, month: 9 } } });
    if (!periodBefore) createdPeriodId = periodAfter?.id ?? null;

    const data = await loadLedgerRowsForReconciliation({
      start: new Date(Date.UTC(YEAR, 8, 1)),
      end: new Date(Date.UTC(YEAR, 8, 30)),
      accountCode: bank.code,
    });

    console.log("\n=== ดึงบัญชีแยกประเภทเพื่อกระทบยอด ===");
    check("พบบัญชีที่ระบุ", data?.account.code, bank.code);
    check("ดึงเฉพาะสองรายการในงวด", data?.rows.length, 2);
    check("เดบิตบัญชีเงินฝากเป็นเงินเข้า", data?.rows[0]?.amount, 125_050);
    check("เครดิตบัญชีเงินฝากเป็นเงินออก", data?.rows[1]?.amount, -8_000);
    check("แสดงวันที่ในรูปแบบรายงาน", data?.rows.map((row) => row.dateLabel), ["10/09/2097", "11/09/2097"]);
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
