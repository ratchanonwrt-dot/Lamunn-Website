/** พิสูจน์ว่ายอดติดลบ/วงเล็บถูกบันทึกเป็นใบลดหนี้และกลับด้านใบสำคัญ
 *
 * ข้อมูลปี ค.ศ. 2093 เท่านั้น ลบเฉพาะ id ที่สคริปต์สร้างใน finally
 * รัน: npx tsx scripts/verify-purchase-credit-note.ts
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

let fails = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? "ผ่าน  " : "ไม่ผ่าน ❌"}  ${label}${ok ? "" : ` (ได้ ${JSON.stringify(actual)} ควรเป็น ${JSON.stringify(expected)})`}`);
  if (!ok) fails += 1;
}

async function main() {
  const [{ prisma }, { createEntry }, { updatePurchaseInvoice, entryDescriptionFor }, { buildInputVatReport }, { signedInputToSatang }, { SYSTEM_ACCOUNTS }] = await Promise.all([
    import("@lamunn/db-finance"),
    import("../src/lib/accounting/post"),
    import("../src/lib/accounting/purchaseInvoiceEdit"),
    import("../src/lib/accounting/taxReports"),
    import("../src/lib/accounting/money"),
    import("../src/lib/accounting/chartOfAccounts"),
  ]);
  const year = 2093;
  const date = new Date(Date.UTC(year, 3, 15));
  const accountIds: string[] = [];
  let entryId: string | null = null;
  let invoiceId: string | null = null;
  let createdPeriodId: string | null = null;
  const existingPeriod = await prisma.accPeriod.findFirst({ where: { year }, select: { id: true } });

  try {
    check("อ่านเครื่องหมายลบพร้อม comma", signedInputToSatang("-1,070.00"), -107000);
    check("อ่านวงเล็บเป็นยอดลบ", signedInputToSatang("(1,070.00)"), -107000);

    const inputVat = await prisma.accAccount.findUnique({ where: { code: SYSTEM_ACCOUNTS.INPUT_VAT } });
    if (!inputVat) throw new Error("ไม่พบบัญชีภาษีซื้อ");
    const expense = await prisma.accAccount.create({ data: { code: `ZZCN-E-${Date.now()}`, nameTh: "[test] ค่าใช้จ่ายใบลดหนี้", type: "EXPENSE" } });
    const payable = await prisma.accAccount.create({ data: { code: `ZZCN-L-${Date.now()}`, nameTh: "[test] เจ้าหนี้ใบลดหนี้", type: "LIABILITY" } });
    accountIds.push(expense.id, payable.id);

    const entry = await createEntry({
      date,
      journalType: "PURCHASE",
      description: entryDescriptionFor("[test] ผู้ขายใบลดหนี้", "[test]-INV-001"),
      lines: [
        { accountId: expense.id, debit: 1000 },
        { accountId: inputVat.id, debit: 70, docNo: "[test]-INV-001" },
        { accountId: payable.id, credit: 1070 },
      ],
    });
    entryId = entry.id;
    if (!existingPeriod) createdPeriodId = (await prisma.accPeriod.findFirst({ where: { year }, select: { id: true } }))?.id ?? null;
    const invoice = await prisma.accPurchaseTaxInvoice.create({
      data: {
        invoiceNo: "[test]-INV-001",
        invoiceDate: date,
        vendorName: "[test] ผู้ขายใบลดหนี้",
        baseAmount: 1000,
        vatAmount: 70,
        totalAmount: 1070,
        entryId: entry.id,
      },
    });
    invoiceId = invoice.id;

    await updatePurchaseInvoice(invoice.id, { amount: "(1,070.00)", amountIncludesVat: true }, { vatRate: 0.07 });
    const [creditNote, creditLines, report] = await Promise.all([
      prisma.accPurchaseTaxInvoice.findUniqueOrThrow({ where: { id: invoice.id } }),
      prisma.accJournalLine.findMany({ where: { entryId: entry.id }, orderBy: { sortOrder: "asc" } }),
      buildInputVatReport(new Date(Date.UTC(year, 3, 1)), new Date(Date.UTC(year, 3, 30, 23, 59, 59, 999))),
    ]);
    check("ใบลดหนี้เก็บฐาน VAT และรวมเป็นลบ", [Number(creditNote.baseAmount), Number(creditNote.vatAmount), Number(creditNote.totalAmount)], [-1000, -70, -1070]);
    check("ใบสำคัญกลับด้านเดบิต", creditLines.map((line) => Number(line.debit)), [0, 0, 1070]);
    check("ใบสำคัญกลับด้านเครดิต", creditLines.map((line) => Number(line.credit)), [1000, 70, 0]);
    check("คำอธิบายเปลี่ยนเป็นใบลดหนี้", (await prisma.accJournalEntry.findUniqueOrThrow({ where: { id: entry.id } })).description, entryDescriptionFor("[test] ผู้ขายใบลดหนี้", "[test]-INV-001", true));
    const reportRow = report.rows.find((row) => row.id === invoice.id);
    check("รายงานภาษีซื้อลดยอดตามใบลดหนี้", [reportRow?.base, reportRow?.vat, reportRow?.total], [-100000, -7000, -107000]);

    await updatePurchaseInvoice(invoice.id, { amount: "1070", amountIncludesVat: true }, { vatRate: 0.07 });
    const restoredLines = await prisma.accJournalLine.findMany({ where: { entryId: entry.id }, orderBy: { sortOrder: "asc" } });
    check("แก้กลับเป็นใบปกติได้โดยไม่ค้างด้านบัญชี", [restoredLines.map((line) => Number(line.debit)), restoredLines.map((line) => Number(line.credit))], [[1000, 70, 0], [0, 0, 1070]]);
  } finally {
    if (invoiceId) await prisma.accPurchaseTaxInvoice.delete({ where: { id: invoiceId } }).catch(() => undefined);
    if (entryId) await prisma.accJournalEntry.delete({ where: { id: entryId } }).catch(() => undefined);
    for (const id of accountIds) await prisma.accAccount.delete({ where: { id } }).catch(() => undefined);
    if (createdPeriodId) await prisma.accPeriod.delete({ where: { id: createdPeriodId } }).catch(() => undefined);
    const remaining = await prisma.accPurchaseTaxInvoice.count({ where: { id: invoiceId ?? "" } });
    console.log(`\n  ข้อมูลทดสอบที่เหลือ: ${remaining}`);
    await prisma.$disconnect();
  }
  console.log(fails === 0 ? "\n✅ ผ่านทั้งหมด\n" : `\n❌ ไม่ผ่าน ${fails} ข้อ\n`);
  process.exitCode = fails === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
