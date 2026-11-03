/** พิสูจน์ว่าใบภาษีซื้อที่ไม่หัก ณ ที่จ่ายสร้างทั้ง PV และ PY ตามวันที่จ่ายและบัญชี 11111
 *
 * รัน: npx tsx scripts/verify-purchase-payment-journals.ts
 */
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const YEAR = 2094;
const invoiceDate = new Date(Date.UTC(YEAR, 0, 10));
const paymentDate = new Date(Date.UTC(YEAR, 0, 20));
let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "ผ่าน" : "ไม่ผ่าน ❌"}  ${label}${ok ? "" : ` (ได้ ${JSON.stringify(actual)} ควรเป็น ${JSON.stringify(expected)})`}`);
  if (!ok) failures++;
}

async function main() {
  const [{ prisma }, journals, posting, chart] = await Promise.all([
    import("@lamunn/db-finance"),
    import("../src/lib/accounting/purchaseWhtJournals"),
    import("../src/lib/accounting/post"),
    import("../src/lib/accounting/chartOfAccounts"),
  ]);
  const suffix = randomUUID().slice(0, 8);
  const accountIds: string[] = [];
  const entryIds: string[] = [];
  const invoiceIds: string[] = [];
  let partnerId: string | null = null;
  let createdPeriodId: string | null = null;

  try {
    const periodBefore = await prisma.accPeriod.findUnique({ where: { year_month: { year: YEAR, month: 1 } } });
    const [inputVat, tradePayable, paymentAccount] = await Promise.all([
      prisma.accAccount.findUnique({ where: { code: chart.SYSTEM_ACCOUNTS.INPUT_VAT } }),
      prisma.accAccount.findUnique({ where: { code: chart.SYSTEM_ACCOUNTS.TRADE_PAYABLE } }),
      prisma.accAccount.findUnique({ where: { code: "11111" } }),
    ]);
    if (!inputVat || !tradePayable || !paymentAccount) {
      throw new Error("ผังบัญชี dev ต้องมี 1155, 2110 และ 11111 ก่อนรันสคริปต์นี้");
    }

    const expense = await prisma.accAccount.create({
      data: { code: `ZZPPAY-${suffix}`, nameTh: `[test] ค่าใช้จ่าย ${suffix}`, type: "EXPENSE" },
    });
    accountIds.push(expense.id);
    const partner = await prisma.accPartner.create({
      data: { name: `[test] ผู้ขาย ${suffix}`, type: "CREDITOR", createdAt: invoiceDate },
    });
    partnerId = partner.id;

    const built = journals.buildPurchasePaymentJournalLines({
      allocations: [{ accountId: expense.id, amountSatang: 100_000 }],
      inputVatAccountId: inputVat.id,
      tradePayableAccountId: tradePayable.id,
      paymentAccountId: paymentAccount.id,
      baseSatang: 100_000,
      vatSatang: 7_000,
      partnerId,
      description: "[test] ค่าบริการ",
      invoiceNo: `[test]-INV-${suffix}`,
    });
    const purchase = await posting.createEntry({
      date: invoiceDate,
      journalType: "PURCHASE",
      description: `[test] ซื้อ ${suffix}`,
      lines: built.purchaseLines,
    });
    entryIds.push(purchase.id);
    if (!periodBefore) {
      const createdPeriod = await prisma.accPeriod.findUnique({ where: { year_month: { year: YEAR, month: 1 } } });
      createdPeriodId = createdPeriod?.id ?? null;
    }
    const payment = await posting.createEntry({
      date: paymentDate,
      journalType: "PAYMENT",
      description: `[test] จ่าย ${suffix}`,
      sourceType: "PURCHASE_TAX_PAYMENT",
      sourceKey: purchase.id,
      lines: built.paymentLines,
    });
    entryIds.push(payment.id);

    const invoice = await prisma.accPurchaseTaxInvoice.create({
      data: {
        invoiceNo: `[test]-INV-${suffix}`,
        invoiceDate,
        claimPeriod: invoiceDate,
        partnerId,
        vendorName: partner.name,
        description: "[test] ค่าบริการ",
        baseAmount: 1000,
        vatAmount: 70,
        totalAmount: 1070,
        entryId: purchase.id,
      },
    });
    invoiceIds.push(invoice.id);

    const [purchaseLines, paymentLines] = await Promise.all([
      prisma.accJournalLine.findMany({ where: { entryId: purchase.id }, orderBy: { sortOrder: "asc" }, include: { account: true } }),
      prisma.accJournalLine.findMany({ where: { entryId: payment.id }, orderBy: { sortOrder: "asc" }, include: { account: true } }),
    ]);
    check("PV ตั้งเจ้าหนี้เต็ม 1,070", purchaseLines.map((line) => [line.account.code, Number(line.debit), Number(line.credit)]), [
      [expense.code, 1000, 0],
      [chart.SYSTEM_ACCOUNTS.INPUT_VAT, 70, 0],
      [chart.SYSTEM_ACCOUNTS.TRADE_PAYABLE, 0, 1070],
    ]);
    check("PY ตัดเจ้าหนี้และจ่ายด้วย 11111", paymentLines.map((line) => [line.account.code, Number(line.debit), Number(line.credit)]), [
      [chart.SYSTEM_ACCOUNTS.TRADE_PAYABLE, 1070, 0],
      ["11111", 0, 1070],
    ]);
    check("วันที่ใบจ่ายตรงวันที่เลือก", payment.date.toISOString().slice(0, 10), "2094-01-20");
    check("ใบกำกับผูก PV", invoice.entryId, purchase.id);
    const linkedPayment = await prisma.accJournalEntry.findUnique({
      where: { sourceType_sourceKey: { sourceType: "PURCHASE_TAX_PAYMENT", sourceKey: invoice.entryId! } },
    });
    check("ใบกำกับตามหา PY ผ่านใบซื้อ", linkedPayment?.id, payment.id);
    check("PY เก็บวันที่จ่าย", linkedPayment?.date.toISOString().slice(0, 10), "2094-01-20");
  } finally {
    console.log("ลบข้อมูลทดสอบด้วย id ที่สร้างในรอบนี้...");
    for (const id of invoiceIds.reverse()) await prisma.accPurchaseTaxInvoice.delete({ where: { id } }).catch(() => undefined);
    for (const id of entryIds.reverse()) await prisma.accJournalEntry.delete({ where: { id } }).catch(() => undefined);
    if (partnerId) await prisma.accPartner.delete({ where: { id: partnerId } }).catch(() => undefined);
    for (const id of accountIds.reverse()) await prisma.accAccount.delete({ where: { id } }).catch(() => undefined);
    if (createdPeriodId) await prisma.accPeriod.delete({ where: { id: createdPeriodId } }).catch(() => undefined);
    await prisma.$disconnect();
  }

  if (failures) throw new Error(`ไม่ผ่าน ${failures} ข้อ`);
  console.log("✅ verify-purchase-payment-journals ผ่านทั้งหมด");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
