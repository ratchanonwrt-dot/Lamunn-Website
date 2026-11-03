/** พิสูจน์การสร้าง ภ.ง.ด.53/50 ทวิจากใบกำกับภาษีซื้อและการปรับยอดที่ผูกกัน
 *
 * ข้อมูลอยู่ปี ค.ศ. 2098 ชื่อขึ้นต้น [test] และ finally ลบด้วย id ที่สคริปต์สร้างเท่านั้น
 * รัน: npx tsx scripts/verify-purchase-wht.ts
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@lamunn/db-finance";
import { createEntry, postEntry, unpostEntry } from "../src/lib/accounting/post";
import { updatePurchaseInvoice } from "../src/lib/accounting/purchaseInvoiceEdit";
import { buildWhtReport } from "../src/lib/accounting/taxReports";
import { SYSTEM_ACCOUNTS } from "../src/lib/accounting/chartOfAccounts";
import { withholdingFromPercent } from "../src/lib/accounting/withholdingMath";

const YEAR = 2098;
const date = new Date(Date.UTC(YEAR, 4, 15));
const suffix = randomUUID().slice(0, 8);
let fails = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "ผ่าน" : "ไม่ผ่าน ❌"}  ${label}${ok ? "" : ` (ได้ ${JSON.stringify(actual)} ควรเป็น ${JSON.stringify(expected)})`}`);
  if (!ok) fails++;
}

async function main() {
  let periodId: string | null = null;
  let expenseId: string | null = null;
  let cashId: string | null = null;
  let partnerId: string | null = null;
  let entryId: string | null = null;
  let invoiceId: string | null = null;
  let certificateId: string | null = null;
  let createdWhtAccountId: string | null = null;
  let legacyWhtAccountId: string | null = null;

  try {
    const existingPeriod = await prisma.accPeriod.findUnique({ where: { year_month: { year: YEAR, month: 5 } } });
    if (!existingPeriod) {
      const period = await prisma.accPeriod.create({ data: { year: YEAR, month: 5 } });
      periodId = period.id;
    }

    const inputVat = await prisma.accAccount.findUnique({ where: { code: SYSTEM_ACCOUNTS.INPUT_VAT } });
    let legacyWhtPayable = await prisma.accAccount.findUnique({ where: { code: SYSTEM_ACCOUNTS.WHT_PAYABLE } });
    if (!legacyWhtPayable) {
      legacyWhtPayable = await prisma.accAccount.create({
        data: {
          code: SYSTEM_ACCOUNTS.WHT_PAYABLE,
          nameTh: "[test] ภาษีหัก ณ ที่จ่ายค้างนำส่งเดิม",
          type: "LIABILITY",
          vatRole: "WHT",
        },
      });
      legacyWhtAccountId = legacyWhtPayable.id;
    }
    let whtPayable = await prisma.accAccount.findUnique({ where: { code: SYSTEM_ACCOUNTS.WHT_PND53_PAYABLE } });
    if (!whtPayable) {
      whtPayable = await prisma.accAccount.create({
        data: {
          code: SYSTEM_ACCOUNTS.WHT_PND53_PAYABLE,
          nameTh: "[test] ภาษีหัก ณ ที่จ่าย - ภ.ง.ด.53",
          type: "LIABILITY",
          vatRole: "WHT",
        },
      });
      createdWhtAccountId = whtPayable.id;
    }
    if (!inputVat || !legacyWhtPayable || !whtPayable) throw new Error("ไม่พบบัญชีระบบภาษีซื้อหรือภาษีหักค้างนำส่ง");

    const expense = await prisma.accAccount.create({
      data: { code: `ZPW-${suffix}-5`, nameTh: "[test] ค่าบริการ", type: "EXPENSE" },
    });
    expenseId = expense.id;
    const cash = await prisma.accAccount.create({
      data: { code: `ZPW-${suffix}-1`, nameTh: "[test] เงินสด", type: "ASSET" },
    });
    cashId = cash.id;
    const partner = await prisma.accPartner.create({
      data: { name: "[test] บริษัทผู้ให้บริการ จำกัด", type: "CREDITOR", taxId: "0105555555555", address: "[test] กรุงเทพฯ" },
    });
    partnerId = partner.id;

    const calc = withholdingFromPercent(100_000, 3);
    check("คำนวณ 3% จาก 1,000 บาทเป็น 30 บาท", calc.amount, 3_000);

    const entry = await createEntry({
      date,
      journalType: "PURCHASE",
      description: "[test] ซื้อบริการพร้อมหัก ณ ที่จ่าย",
      lines: [
        { accountId: expense.id, debit: 1000, partnerId: partner.id },
        { accountId: inputVat.id, debit: 70, memo: "ภาษีซื้อ" },
        { accountId: cash.id, credit: 1040, partnerId: partner.id },
        { accountId: legacyWhtPayable.id, credit: 30, partnerId: partner.id, memo: "ภาษีหัก ณ ที่จ่าย" },
      ],
    });
    entryId = entry.id;

    const invoice = await prisma.accPurchaseTaxInvoice.create({
      data: {
        invoiceNo: `[test]-INV-${suffix}`,
        invoiceDate: date,
        partnerId: partner.id,
        vendorName: partner.name,
        vendorTaxId: partner.taxId,
        vendorBranchTag: "สำนักงานใหญ่",
        description: "[test] ค่าบริการ",
        baseAmount: 1000,
        vatAmount: 70,
        totalAmount: 1070,
        entryId: entry.id,
      },
    });
    invoiceId = invoice.id;
    const certificate = await prisma.accWhtCertificate.create({
      data: {
        docNo: `[test]-WHT-${suffix}`,
        payDate: date,
        formType: "PND53",
        partnerId: partner.id,
        purchaseInvoiceId: invoice.id,
        payeeName: partner.name,
        payeeTaxId: partner.taxId,
        payeeAddress: partner.address,
        payeeBranchTag: "สำนักงานใหญ่",
        incomeType: "ค่าบริการอื่น ๆ ม.40(8)",
        baseAmount: 1000,
        whtRate: 0.03,
        whtAmount: 30,
        entryId: entry.id,
      },
    });
    certificateId = certificate.id;

    await postEntry(entry.id);
    await updatePurchaseInvoice(invoice.id, { description: "[test] ค่าบริการแก้ไข" }, { vatRate: 0.07 });
    const migratedEntry = await prisma.accJournalEntry.findUniqueOrThrow({
      where: { id: entry.id },
      include: { lines: true },
    });
    check("แก้ใบเก่าแล้วยังผ่านรายการอยู่", migratedEntry.status, "POSTED");
    check("ย้ายบรรทัด ภ.ง.ด.53 จาก 2130 ไป 27124", migratedEntry.lines.some((line) => line.accountId === whtPayable.id), true);
    check("ไม่มีบรรทัด ภ.ง.ด.53 ค้างที่ 2130", migratedEntry.lines.some((line) => line.accountId === legacyWhtPayable.id), false);
    check(
      "เดบิตเครดิตยังเท่ากันหลังย้ายบัญชี",
      migratedEntry.lines.reduce((sum, line) => sum + Number(line.debit) - Number(line.credit), 0),
      0
    );

    await unpostEntry(entry.id);

    const report = await buildWhtReport(
      new Date(Date.UTC(YEAR, 4, 1)),
      new Date(Date.UTC(YEAR, 4, 31, 23, 59, 59)),
      "PND53"
    );
    const row = report.rows.find((item) => item.id === certificate.id);
    check("เอกสารเข้า ภ.ง.ด.53", Boolean(row), true);
    check("ฐาน/ภาษีในรายงานถูกต้องเป็นสตางค์", [row?.base, row?.wht], [100_000, 3_000]);

    await updatePurchaseInvoice(invoice.id, { amount: "2140", amountIncludesVat: true }, { vatRate: 0.07 });
    const [updatedCert, lines] = await Promise.all([
      prisma.accWhtCertificate.findUniqueOrThrow({ where: { id: certificate.id } }),
      prisma.accJournalLine.findMany({ where: { entryId: entry.id }, orderBy: { sortOrder: "asc" } }),
    ]);
    check("แก้ยอดแล้วฐาน/ภาษีหักขยับตาม", [Number(updatedCert.baseAmount), Number(updatedCert.whtAmount)], [2000, 60]);
    check("ใบสำคัญยังมี 4 บรรทัด", lines.length, 4);
    const debit = lines.reduce((sum, line) => sum + Number(line.debit), 0);
    const credit = lines.reduce((sum, line) => sum + Number(line.credit), 0);
    check("เดบิตเท่ากับเครดิตหลังแก้ยอด", [debit, credit], [2140, 2140]);
    const updatedWhtLine = lines.find((line) => line.accountId === whtPayable.id);
    check("ภ.ง.ด.53 ผูกบัญชี 27124", Boolean(updatedWhtLine), true);
    check("ยอดเครดิตบัญชี 27124 ปรับตามใบกำกับ", Number(updatedWhtLine?.credit), 60);
  } finally {
    console.log("ลบข้อมูลทดสอบด้วย id ที่สร้างในรอบนี้...");
    if (certificateId) await prisma.accWhtCertificate.delete({ where: { id: certificateId } }).catch(() => undefined);
    if (invoiceId) await prisma.accPurchaseTaxInvoice.delete({ where: { id: invoiceId } }).catch(() => undefined);
    if (entryId) await prisma.accJournalEntry.delete({ where: { id: entryId } }).catch(() => undefined);
    if (partnerId) await prisma.accPartner.delete({ where: { id: partnerId } }).catch(() => undefined);
    if (expenseId) await prisma.accAccount.delete({ where: { id: expenseId } }).catch(() => undefined);
    if (cashId) await prisma.accAccount.delete({ where: { id: cashId } }).catch(() => undefined);
    if (createdWhtAccountId) await prisma.accAccount.delete({ where: { id: createdWhtAccountId } }).catch(() => undefined);
    if (legacyWhtAccountId) await prisma.accAccount.delete({ where: { id: legacyWhtAccountId } }).catch(() => undefined);
    if (periodId) await prisma.accPeriod.delete({ where: { id: periodId } }).catch(() => undefined);
  }

  if (fails) throw new Error(`ไม่ผ่าน ${fails} ข้อ`);
  console.log("✅ verify-purchase-wht ผ่านทั้งหมด");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
