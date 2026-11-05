/** พิสูจน์กฎการแก้ไขใบกำกับภาษีซื้อ (purchaseInvoiceEdit.ts)
 *
 * สร้างข้อมูลในปี ค.ศ. 2092 แล้วลบทิ้งทั้งหมดใน finally
 * รัน: npx tsx scripts/verify-purchase-invoice-edit.ts   (จากโฟลเดอร์ Lamunn-Finance)
 */
import { prisma } from "@lamunn/db-finance";
import { createEntry, postEntry, unpostEntry } from "../src/lib/accounting/post";
import { updatePurchaseInvoice as _update, entryDescriptionFor } from "../src/lib/accounting/purchaseInvoiceEdit";
import { SYSTEM_ACCOUNTS } from "../src/lib/accounting/chartOfAccounts";
import { summarizePurchaseTaxLineItems } from "../src/lib/accounting/purchaseTaxLineItems";
import { resolvePurchaseTaxAccountAllocations } from "../src/lib/accounting/purchaseTaxAccountAllocation";

const P = "ZZPINV";
const updatePurchaseInvoice = (id: string, patch: Parameters<typeof _update>[1]) => _update(id, patch, { vatRate: 0.07 });
const YEAR = 2092;
const day = (d: number) => new Date(Date.UTC(YEAR, 2, d));

let fails = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? "ผ่าน  " : "ไม่ผ่าน ❌"}  ${label}${ok ? "" : `  (ได้ ${JSON.stringify(actual)} ควรเป็น ${JSON.stringify(expected)})`}`);
  if (!ok) fails++;
}
async function expectError(label: string, fn: () => Promise<unknown>, contains: string) {
  try {
    await fn();
    check(label, "ไม่มี error", `error มีคำว่า "${contains}"`);
  } catch (e) {
    check(label, (e as Error).message.includes(contains), true);
  }
}

async function main() {
  if (process.argv.includes("--pure")) {
    console.log("\n=== พิสูจน์การคำนวณรายละเอียดสินค้าสำหรับฟอร์มแก้ไข ===");
    const summary = summarizePurchaseTaxLineItems([{
      category: "RAW_MATERIAL",
      description: "[test] วัตถุดิบ",
      quantity: "2",
      unitPrice: "100.0050",
      priceCondition: "VAT",
      vatRatePercent: "7",
    }], 0.07, "NEAREST");
    check("ราคาต่อหน่วย 4 ตำแหน่งคำนวณฐานถูกต้อง", summary.baseSatang, 20001);
    check("คำนวณ VAT และยอดรวมถูกต้อง", [summary.vatSatang, summary.totalSatang], [1400, 21401]);
    check("ข้อมูลที่บันทึกกลับยังมีหมวดและรายละเอียด", [summary.items[0]?.category, summary.items[0]?.description], ["RAW_MATERIAL", "[test] วัตถุดิบ"]);
    const allocations = resolvePurchaseTaxAccountAllocations([
      { accountId: "[test]-expense-1", amount: "120.01" },
      { accountId: "[test]-expense-2", amount: "80.00" },
    ], summary.baseSatang);
    check("ส่วนลงบัญชีแบบแก้ไขแบ่งยอดได้ครบฐานก่อน VAT", allocations.map((item) => item.amountSatang), [12001, 8000]);
    console.log(fails === 0 ? "\n✅ ผ่านทั้งหมด\n" : `\n❌ ไม่ผ่าน ${fails} ข้อ\n`);
    process.exit(fails === 0 ? 0 : 1);
  }
  const entryIds: string[] = [];
  const invoiceIds: string[] = [];
  const accountIds: string[] = [];
  try {
    const inputVat = await prisma.accAccount.findUnique({ where: { code: SYSTEM_ACCOUNTS.INPUT_VAT } });
    if (!inputVat) throw new Error("ไม่พบบัญชีภาษีซื้อในผัง");
    const expense = await prisma.accAccount.create({ data: { code: `${P}-5000`, nameTh: "[test] ค่าใช้จ่าย", type: "EXPENSE" } });
    const cash = await prisma.accAccount.create({ data: { code: `${P}-1000`, nameTh: "[test] เงินสด", type: "ASSET" } });
    accountIds.push(expense.id, cash.id);

    // ใบกำกับ 1,070 บาท (ฐาน 1,000 + VAT 70) ผูกใบสำคัญร่าง
    const entry = await createEntry({
      date: day(5),
      journalType: "PURCHASE",
      description: entryDescriptionFor("[test] ร้านเอ", "INV-001"),
      lines: [
        { accountId: expense.id, debit: 1000, memo: "ของ" },
        { accountId: inputVat.id, debit: 70, memo: "ภาษีซื้อ" },
        { accountId: cash.id, credit: 1070 },
      ],
    });
    entryIds.push(entry.id);
    const inv = await prisma.accPurchaseTaxInvoice.create({
      data: { invoiceNo: "INV-001", invoiceDate: day(5), vendorName: "[test] ร้านเอ", vendorTaxId: "1111111111111", baseAmount: 1000, vatAmount: 70, totalAmount: 1070, entryId: entry.id },
    });
    invoiceIds.push(inv.id);
    const other = await prisma.accPurchaseTaxInvoice.create({
      data: { invoiceNo: "INV-002", invoiceDate: day(6), vendorName: "[test] ร้านเอ", vendorTaxId: "1111111111111", baseAmount: 100, vatAmount: 7, totalAmount: 107 },
    });
    invoiceIds.push(other.id);

    console.log("\n=== แก้เลขที่ใบกำกับ (เคสหลัก: คีย์ตกหล่น) ===");
    await updatePurchaseInvoice(inv.id, { invoiceNo: "INV-0010" });
    check("เลขที่เปลี่ยน", (await prisma.accPurchaseTaxInvoice.findUniqueOrThrow({ where: { id: inv.id } })).invoiceNo, "INV-0010");
    check("คำอธิบายใบสำคัญตามไปด้วย", (await prisma.accJournalEntry.findUniqueOrThrow({ where: { id: entry.id } })).description, entryDescriptionFor("[test] ร้านเอ", "INV-0010"));
    await expectError("เลขซ้ำกับใบอื่นของผู้ขายเดียวกัน ถูกปฏิเสธ", () => updatePurchaseInvoice(inv.id, { invoiceNo: "INV-002" }), "มีอยู่แล้ว");

    console.log("\n=== แก้ยอดตอนใบสำคัญยังเป็นร่าง ===");
    await updatePurchaseInvoice(inv.id, { amount: "2140", amountIncludesVat: true });
    const after = await prisma.accPurchaseTaxInvoice.findUniqueOrThrow({ where: { id: inv.id } });
    check("ฐาน/VAT แยกใหม่", [Number(after.baseAmount), Number(after.vatAmount), Number(after.totalAmount)], [2000, 140, 2140]);
    const lines = await prisma.accJournalLine.findMany({ where: { entryId: entry.id }, orderBy: { sortOrder: "asc" } });
    check("บรรทัดใบสำคัญปรับตาม (เดบิต)", lines.map((l) => Number(l.debit)), [2000, 140, 0]);
    check("บรรทัดใบสำคัญปรับตาม (เครดิต)", lines.map((l) => Number(l.credit)), [0, 0, 2140]);
    check("หมายเหตุบรรทัดยังอยู่", lines.map((l) => l.memo), ["ของ", "ภาษีซื้อ", null]);
    check("บัญชีเดิมทุกบรรทัด", lines.map((l) => l.accountId), [expense.id, inputVat.id, cash.id]);

    await updatePurchaseInvoice(inv.id, { invoiceDate: `${YEAR}-03-20` });
    const dated = await prisma.accJournalLine.findMany({ where: { entryId: entry.id }, select: { date: true } });
    check("แก้วันที่แล้ววันที่บนบรรทัดตามไปด้วย", dated.every((l) => l.date.toISOString().slice(0, 10) === `${YEAR}-03-20`), true);

    console.log("\n=== ใบสำคัญผ่านรายการแล้ว ===");
    await postEntry(entry.id);
    await expectError("แก้ยอดถูกปฏิเสธ", () => updatePurchaseInvoice(inv.id, { amount: "5000" }), "ยกเลิกผ่านรายการ");
    await expectError("แก้วันที่ถูกปฏิเสธ", () => updatePurchaseInvoice(inv.id, { invoiceDate: `${YEAR}-03-21` }), "ยกเลิกผ่านรายการ");
    await updatePurchaseInvoice(inv.id, { invoiceNo: "INV-0011", vendorName: "[test] ร้านเอ จำกัด" });
    check("แต่แก้เลขที่/ชื่อยังได้", (await prisma.accPurchaseTaxInvoice.findUniqueOrThrow({ where: { id: inv.id } })).vendorName, "[test] ร้านเอ จำกัด");
    check("ยอดใบสำคัญไม่ถูกแตะ", (await prisma.accJournalLine.aggregate({ where: { entryId: entry.id }, _sum: { debit: true } }))._sum.debit?.toNumber(), 2140);
    await unpostEntry(entry.id);
    await updatePurchaseInvoice(inv.id, { amount: "535" });
    check("ยกเลิกผ่านรายการแล้วแก้ยอดได้อีก", Number((await prisma.accPurchaseTaxInvoice.findUniqueOrThrow({ where: { id: inv.id } })).vatAmount), 35);

    console.log("\n=== แก้รายละเอียดสินค้าแบบเดียวกับหน้าสร้าง ===");
    await updatePurchaseInvoice(inv.id, {
      amount: "200.01",
      amountIncludesVat: false,
      vatRounding: "NEAREST",
      lineItems: [{
        category: "RAW_MATERIAL",
        description: "[test] วัตถุดิบ",
        quantity: "2",
        unitPrice: "100.0050",
        priceCondition: "VAT",
        vatRatePercent: "7",
      }],
      expenseLines: [{ accountId: expense.id, amount: "200.01" }],
      paymentDate: `${YEAR}-03-20`,
      paymentAccountId: cash.id,
      whtIncomeType: "",
    });
    const itemEdited = await prisma.accPurchaseTaxInvoice.findUniqueOrThrow({ where: { id: inv.id } });
    check("รายละเอียดสินค้าถูกเก็บพร้อมยอดคำนวณใหม่", [Number(itemEdited.baseAmount), Number(itemEdited.vatAmount), Array.isArray(itemEdited.lineItems)], [200.01, 14, true]);
    check("ใบสำคัญปรับตามยอดจากรายละเอียดสินค้า", (await prisma.accJournalLine.aggregate({ where: { entryId: entry.id }, _sum: { debit: true } }))._sum.debit?.toNumber(), 214.01);
    const paymentEntry = await prisma.accJournalEntry.findUnique({ where: { sourceType_sourceKey: { sourceType: "PURCHASE_TAX_PAYMENT", sourceKey: entry.id } } });
    check("ฟอร์มแก้ไขสร้างสมุดรายวันจ่ายตามบัญชีที่เลือก", [paymentEntry?.journalType, paymentEntry?.date.toISOString().slice(0, 10)], ["PAYMENT", `${YEAR}-03-20`]);
    if (paymentEntry) entryIds.push(paymentEntry.id);

    console.log("\n=== คำอธิบายที่บัญชีแก้เองต้องไม่ถูกทับ ===");
    await prisma.accJournalEntry.update({ where: { id: entry.id }, data: { description: "[test] คำอธิบายที่บัญชีแก้เอง" } });
    await updatePurchaseInvoice(inv.id, { invoiceNo: "INV-0012" });
    check("คำอธิบายเดิมคงอยู่", (await prisma.accJournalEntry.findUniqueOrThrow({ where: { id: entry.id } })).description, "[test] คำอธิบายที่บัญชีแก้เอง");

    console.log("\n=== ใบที่ยกเลิกแล้ว ===");
    await prisma.accPurchaseTaxInvoice.update({ where: { id: other.id }, data: { voided: true } });
    await expectError("แก้ไม่ได้", () => updatePurchaseInvoice(other.id, { invoiceNo: "X" }), "ยกเลิกไปแล้ว");
  } finally {
    console.log("\n=== ลบข้อมูลทดสอบ ===");
    await prisma.accPurchaseTaxInvoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.accJournalEntry.deleteMany({ where: { id: { in: entryIds } } });
    await prisma.accAccount.deleteMany({ where: { code: { startsWith: P } } });
    await prisma.accPeriod.deleteMany({ where: { year: YEAR } });
    console.log(`  ข้อมูลทดสอบที่เหลือ: ${await prisma.accPurchaseTaxInvoice.count({ where: { vendorName: { startsWith: "[test]" } } })}`);
  }
  console.log(fails === 0 ? "\n✅ ผ่านทั้งหมด\n" : `\n❌ ไม่ผ่าน ${fails} ข้อ\n`);
  process.exit(fails === 0 ? 0 : 1);
}
main();
