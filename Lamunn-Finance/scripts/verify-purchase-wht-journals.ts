/** พิสูจน์ว่าใบภาษีซื้อที่มีหัก ณ ที่จ่ายสร้าง PV ตั้งเจ้าหนี้ และ PY ตัดจ่ายครบถ้วน
 *
 * รัน: npx tsx scripts/verify-purchase-wht-journals.ts
 */
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const YEAR = 2093;
const date = new Date(Date.UTC(YEAR, 0, 15));
let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "ผ่าน" : "ไม่ผ่าน ❌"}  ${label}${ok ? "" : ` (ได้ ${JSON.stringify(actual)} ควรเป็น ${JSON.stringify(expected)})`}`);
  if (!ok) failures++;
}

async function checkJournalNotePure() {
  const journals = await import("../src/lib/accounting/purchaseWhtJournals");
  const note = "[test] หมายเหตุจากใบกำกับ";
  const built = journals.buildPurchasePaymentJournalLines({
    allocations: [{ accountId: "[test]-expense", amountSatang: 100_000 }],
    inputVatAccountId: "[test]-input-vat",
    tradePayableAccountId: "[test]-payable",
    paymentAccountId: "[test]-bank",
    baseSatang: 100_000,
    vatSatang: 7_000,
    description: "[test] ค่าบริการ",
    note,
    invoiceNo: "[test]-INV-PURE",
  });
  check("หมายเหตุเชื่อมไปสมุดรายวันซื้อ", built.purchaseLines[0].memo, `[test] ค่าบริการ · หมายเหตุ: ${note}`);
  check("หมายเหตุเชื่อมไปสมุดรายวันจ่าย", built.paymentLines[1].memo, `จ่ายชำระเจ้าหนี้ · หมายเหตุ: ${note}`);
}

async function main() {
  if (process.argv.includes("--pure")) {
    await checkJournalNotePure();
    if (failures) throw new Error(`ไม่ผ่าน ${failures} ข้อ`);
    console.log("✅ หมายเหตุจากใบกำกับเชื่อมไปสมุดรายวันซื้อและจ่ายถูกต้อง");
    return;
  }

  const [{ prisma }, journals, posting, invoiceEdit, chart] = await Promise.all([
    import("@lamunn/db-finance"),
    import("../src/lib/accounting/purchaseWhtJournals"),
    import("../src/lib/accounting/post"),
    import("../src/lib/accounting/purchaseInvoiceEdit"),
    import("../src/lib/accounting/chartOfAccounts"),
  ]);
  const suffix = randomUUID().slice(0, 8);
  const accountIds: string[] = [];
  const entryIds: string[] = [];
  const invoiceIds: string[] = [];
  const certificateIds: string[] = [];
  let partnerId: string | null = null;
  let createdPeriodId: string | null = null;
  const journalNote = `[test] หมายเหตุจากใบกำกับ ${suffix}`;

  try {
    const periodBefore = await prisma.accPeriod.findUnique({ where: { year_month: { year: YEAR, month: 1 } } });
    const [inputVat, tradePayable, whtPayable] = await Promise.all([
      prisma.accAccount.findUnique({ where: { code: chart.SYSTEM_ACCOUNTS.INPUT_VAT } }),
      prisma.accAccount.findUnique({ where: { code: chart.SYSTEM_ACCOUNTS.TRADE_PAYABLE } }),
      prisma.accAccount.findUnique({ where: { code: chart.SYSTEM_ACCOUNTS.WHT_PND53_PAYABLE } }),
    ]);
    if (!inputVat || !tradePayable || !whtPayable) throw new Error("ผังบัญชี dev ต้องมี 1155, 2110 และ 27124 ก่อนรันสคริปต์นี้");

    const expense = await prisma.accAccount.create({
      data: { code: `ZZPWHT-${suffix}-5`, nameTh: `[test] ค่าใช้จ่าย ${suffix}`, type: "EXPENSE" },
    });
    accountIds.push(expense.id);
    const bank = await prisma.accAccount.create({
      data: { code: `ZZPWHT-${suffix}-1`, nameTh: `[test] เงินฝากธนาคาร ${suffix}`, type: "ASSET" },
    });
    accountIds.push(bank.id);
    const partner = await prisma.accPartner.create({
      data: { name: `[test] ผู้ขาย ${suffix}`, type: "CREDITOR", createdAt: date },
    });
    partnerId = partner.id;

    const built = journals.buildPurchaseWhtJournalLines({
      allocations: [{ accountId: expense.id, amountSatang: 100_000 }],
      inputVatAccountId: inputVat.id,
      tradePayableAccountId: tradePayable.id,
      paymentAccountId: bank.id,
      whtPayableAccountId: whtPayable.id,
      baseSatang: 100_000,
      vatSatang: 7_000,
      whtSatang: 3_000,
      partnerId,
      description: "[test] ค่าบริการ",
      note: journalNote,
      invoiceNo: `[test]-INV-${suffix}`,
    });
    const purchase = await posting.createEntry({
      date,
      journalType: "PURCHASE",
      description: invoiceEdit.entryDescriptionFor(partner.name, `[test]-INV-${suffix}`),
      lines: built.purchaseLines,
    });
    entryIds.push(purchase.id);
    if (!periodBefore) {
      const createdPeriod = await prisma.accPeriod.findUnique({ where: { year_month: { year: YEAR, month: 1 } } });
      createdPeriodId = createdPeriod?.id ?? null;
    }
    const payment = await posting.createEntry({
      date,
      journalType: "PAYMENT",
      description: journals.purchasePaymentEntryDescriptionFor(partner.name, `[test]-INV-${suffix}`),
      lines: built.paymentLines,
    });
    entryIds.push(payment.id);

    const invoice = await prisma.accPurchaseTaxInvoice.create({
      data: {
        invoiceNo: `[test]-INV-${suffix}`,
        invoiceDate: date,
        claimPeriod: date,
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
    const certificate = await prisma.accWhtCertificate.create({
      data: {
        docNo: `[test]-WHT-${suffix}`,
        payDate: date,
        formType: "PND53",
        partnerId,
        purchaseInvoiceId: invoice.id,
        payeeName: partner.name,
        incomeType: "[test] ค่าบริการ",
        baseAmount: 1000,
        whtRate: 0.03,
        whtAmount: 30,
        entryId: payment.id,
      },
    });
    certificateIds.push(certificate.id);

    const purchaseLines = await prisma.accJournalLine.findMany({ where: { entryId: purchase.id }, orderBy: { sortOrder: "asc" }, include: { account: true } });
    const paymentLines = await prisma.accJournalLine.findMany({ where: { entryId: payment.id }, orderBy: { sortOrder: "asc" }, include: { account: true } });
    check("PV เป็นสมุดรายวันซื้อ", purchase.journalType, "PURCHASE");
    check("PV ตั้งเจ้าหนี้เต็ม 1,070", purchaseLines.map((line) => [line.account.code, Number(line.debit), Number(line.credit)]), [
      [expense.code, 1000, 0],
      [chart.SYSTEM_ACCOUNTS.INPUT_VAT, 70, 0],
      [chart.SYSTEM_ACCOUNTS.TRADE_PAYABLE, 0, 1070],
    ]);
    check("PY เป็นสมุดรายวันจ่าย", payment.journalType, "PAYMENT");
    check("PY ตัดเจ้าหนี้ จ่ายสุทธิ และตั้ง ภ.ง.ด.53", paymentLines.map((line) => [line.account.code, Number(line.debit), Number(line.credit)]), [
      [chart.SYSTEM_ACCOUNTS.TRADE_PAYABLE, 1070, 0],
      [bank.code, 0, 1040],
      [chart.SYSTEM_ACCOUNTS.WHT_PND53_PAYABLE, 0, 30],
    ]);
    check("หมายเหตุอยู่ในสมุดรายวันซื้อ", purchaseLines[0].memo, `[test] ค่าบริการ · หมายเหตุ: ${journalNote}`);
    check("หมายเหตุอยู่ในสมุดรายวันจ่าย", paymentLines[1].memo, `จ่ายสุทธิหลังหักภาษี ณ ที่จ่าย · หมายเหตุ: ${journalNote}`);
    check("ใบกำกับผูก PV", invoice.entryId, purchase.id);
    check("หนังสือรับรองผูก PY", certificate.entryId, payment.id);

    await invoiceEdit.updatePurchaseInvoice(invoice.id, { amount: "2140", amountIncludesVat: true }, { vatRate: 0.07 });
    const [purchaseAfter, paymentAfter] = await Promise.all([
      prisma.accJournalLine.findMany({ where: { entryId: purchase.id }, orderBy: { sortOrder: "asc" } }),
      prisma.accJournalLine.findMany({ where: { entryId: payment.id }, orderBy: { sortOrder: "asc" } }),
    ]);
    check("แก้ยอดแล้ว PV เป็น 2,140", purchaseAfter.map((line) => [Number(line.debit), Number(line.credit)]), [[2000, 0], [140, 0], [0, 2140]]);
    check("แก้ยอดแล้ว PY ตัด 2,140 จ่าย 2,080 หัก 60", paymentAfter.map((line) => [Number(line.debit), Number(line.credit)]), [[2140, 0], [0, 2080], [0, 60]]);

    await posting.voidEntry(purchase.id);
    await posting.voidEntry(payment.id);
    const voidLines = await prisma.accJournalLine.findMany({ where: { entryId: { in: [purchase.id, payment.id] } }, select: { status: true } });
    check("ยกเลิกแล้วสถานะบรรทัดทั้ง PV/PY เป็น VOID", voidLines.every((line) => line.status === "VOID"), true);

  } finally {
    console.log("ลบข้อมูลทดสอบด้วย id ที่สร้างในรอบนี้...");
    for (const id of certificateIds.reverse()) await prisma.accWhtCertificate.delete({ where: { id } }).catch(() => undefined);
    for (const id of invoiceIds.reverse()) await prisma.accPurchaseTaxInvoice.delete({ where: { id } }).catch(() => undefined);
    for (const id of entryIds.reverse()) await prisma.accJournalEntry.delete({ where: { id } }).catch(() => undefined);
    if (partnerId) await prisma.accPartner.delete({ where: { id: partnerId } }).catch(() => undefined);
    for (const id of accountIds.reverse()) await prisma.accAccount.delete({ where: { id } }).catch(() => undefined);
    if (createdPeriodId) await prisma.accPeriod.delete({ where: { id: createdPeriodId } }).catch(() => undefined);
    await prisma.$disconnect();
  }

  if (failures) throw new Error(`ไม่ผ่าน ${failures} ข้อ`);
  console.log("✅ verify-purchase-wht-journals ผ่านทั้งหมด");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
