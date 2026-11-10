/** พิสูจน์รายละเอียดใบกำกับภาษีซื้อหลายบรรทัด เงื่อนไข VAT และการเก็บ snapshot
 *
 * รัน: npx tsx scripts/verify-purchase-tax-line-items.ts
 */
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import type { Prisma } from "@lamunn/db-finance";
import { lineTotalInputFromSnapshot, summarizePurchaseTaxLineItems, summarizePurchaseTaxTotal, totalConditionFromSnapshot } from "../src/lib/accounting/purchaseTaxLineItems";
import { toBaht } from "../src/lib/accounting/money";

loadEnvConfig(process.cwd());

const YEAR = 2098;

function checkTenDecimalUnitPrice() {
  const summary = summarizePurchaseTaxLineItems([
    { category: "RAW_MATERIAL", description: "[test] ราคาละเอียด", quantity: "3.5", unitPrice: "12.3456789012", priceCondition: "VAT", vatRatePercent: "7" },
  ], 0.07);
  const item = summary.items[0];
  if (summary.errors.length > 0) throw new Error(summary.errors.join(", "));
  if (!item || item.unitPriceDecimal !== "12.3456789012" || item.unitPriceSubSatang !== 123_457 || item.unitPriceSatang !== 1_235) {
    throw new Error("ราคาต่อหน่วย 10 ตำแหน่งไม่ได้เก็บแบบ exact หรือค่า compatibility ไม่ถูกต้อง");
  }
  if (item.baseSatang !== 4_321 || item.vatSatang !== 302 || item.totalSatang !== 4_623) {
    throw new Error(`ยอดจากราคา 10 ตำแหน่งผิด: base=${item.baseSatang} vat=${item.vatSatang} total=${item.totalSatang}`);
  }

  const invalid = summarizePurchaseTaxLineItems([
    { category: "OTHER", description: "[test] ทศนิยมเกิน", quantity: "1", unitPrice: "12.34567890123", priceCondition: "VAT" },
  ], 0.07);
  if (!invalid.errors.some((error) => error.includes("ทศนิยมไม่เกิน 10 ตำแหน่ง"))) {
    throw new Error("ระบบต้องปฏิเสธราคาต่อหน่วยที่เกิน 10 ตำแหน่ง");
  }

  const tiny = summarizePurchaseTaxLineItems([
    { category: "OTHER", description: "[test] ตำแหน่งที่สิบ", quantity: "100000000", unitPrice: "0.0000000001", priceCondition: "VAT_EXEMPT" },
  ], 0.07);
  if (tiny.errors.length > 0 || tiny.baseSatang !== 1 || tiny.items[0]?.unitPriceDecimal !== "0.0000000001") {
    throw new Error("ตำแหน่งทศนิยมที่ 10 ไม่ถูกนำไปคำนวณก่อนปัดเป็นสตางค์");
  }
}

function checkEditableLineTotal() {
  const summary = summarizePurchaseTaxLineItems([
    { category: "RAW_MATERIAL", description: "[test] ราคารวมแก้เอง", quantity: "480", unitPrice: "106.5420", lineTotal: "51140.00", priceCondition: "VAT", vatRatePercent: "7" },
  ], 0.07);
  const item = summary.items[0];
  if (summary.errors.length > 0) throw new Error(summary.errors.join(", "));
  if (!item?.lineTotalOverridden || item.baseSatang !== 5_114_000 || item.vatSatang !== 357_980 || item.totalSatang !== 5_471_980) {
    throw new Error("ราคารวมที่ผู้ใช้แก้ไม่ได้เป็นยอดหลักของบรรทัดและภาษี");
  }
  if (lineTotalInputFromSnapshot(item) !== "51140.00") {
    throw new Error("หน้าแก้ไขไม่สามารถคืนค่าราคารวมที่ผู้ใช้กำหนดไว้");
  }

  const invalid = summarizePurchaseTaxLineItems([
    { category: "OTHER", description: "[test] ราคารวมเกินสตางค์", quantity: "1", unitPrice: "1", lineTotal: "1.001", priceCondition: "VAT" },
  ], 0.07);
  if (!invalid.errors.some((error) => error.includes("ทศนิยมไม่เกิน 2 ตำแหน่ง"))) {
    throw new Error("ระบบต้องปฏิเสธราคารวมที่ละเอียดเกินหนึ่งสตางค์");
  }
}

function checkLineTotalVatConditions() {
  const manualExcluded = summarizePurchaseTaxTotal(2_000_000, 0.07, "VAT_EXCLUDED");
  if (manualExcluded.baseSatang !== 2_000_000 || manualExcluded.vatSatang !== 140_000 || manualExcluded.totalSatang !== 2_140_000) {
    throw new Error("ยอดกรอก 20,000 แบบก่อน VAT ต้องได้ภาษี 1,400 และสุทธิ 21,400");
  }
  const manualIncluded = summarizePurchaseTaxTotal(2_000_000, 0.07, "VAT_INCLUDED");
  if (manualIncluded.baseSatang !== 1_869_159 || manualIncluded.vatSatang !== 130_841 || manualIncluded.totalSatang !== 2_000_000) {
    throw new Error("ยอดกรอก 20,000 แบบรวม VAT ต้องถอดฐาน 18,691.59 ภาษี 1,308.41 และสุทธิเท่าเดิม");
  }

  const exactIncluded = summarizePurchaseTaxTotal(2_140_000, 0.07, "VAT_INCLUDED");
  if (exactIncluded.baseSatang !== 2_000_000 || exactIncluded.vatSatang !== 140_000 || exactIncluded.totalSatang !== 2_140_000) {
    throw new Error("ยอดกรอก 21,400 แบบรวม VAT ต้องถอดฐาน 20,000 ภาษี 1,400 และสุทธิ 21,400");
  }

  const vatIncluded = summarizePurchaseTaxLineItems([
    { category: "RAW_MATERIAL", description: "[test] ยอดรวมภาษี", quantity: "1", unitPrice: "107", lineTotal: "107.00", priceCondition: "VAT", totalCondition: "VAT_INCLUDED", vatRatePercent: "7" },
  ], 0.07);
  const includedItem = vatIncluded.items[0];
  if (vatIncluded.errors.length > 0 || includedItem?.baseSatang !== 10_000 || includedItem.vatSatang !== 700 || includedItem.totalSatang !== 10_700) {
    throw new Error("ยอดรวมภาษี 7% ไม่ได้ถูกถอดเป็นฐาน 100.00 และภาษี 7.00");
  }
  if (totalConditionFromSnapshot(includedItem) !== "VAT_INCLUDED" || lineTotalInputFromSnapshot(includedItem) !== "107.00") {
    throw new Error("snapshot ยอดรวมภาษีไม่สามารถคืนเงื่อนไขและยอดที่ผู้ใช้กรอก");
  }

  const vatExcluded = summarizePurchaseTaxLineItems([
    { category: "RAW_MATERIAL", description: "[test] ยอดก่อนภาษี", quantity: "1", unitPrice: "107", lineTotal: "107.00", priceCondition: "VAT", totalCondition: "VAT_EXCLUDED", vatRatePercent: "7" },
  ], 0.07);
  const excludedItem = vatExcluded.items[0];
  if (vatExcluded.errors.length > 0 || excludedItem?.baseSatang !== 10_700 || excludedItem.vatSatang !== 749 || excludedItem.totalSatang !== 11_449) {
    throw new Error("ยอดก่อนภาษี 7% ไม่ได้ถูกใช้เป็นฐานแล้วบวกภาษีอย่างถูกต้อง");
  }
  if (totalConditionFromSnapshot({}) !== "VAT_EXCLUDED") {
    throw new Error("เอกสารเก่าต้องใช้เงื่อนไขยอดก่อนภาษีเพื่อไม่เปลี่ยนยอดเดิม");
  }
}

async function main() {
  checkTenDecimalUnitPrice();
  checkEditableLineTotal();
  checkLineTotalVatConditions();
  if (process.argv.includes("--pure")) {
    console.log("✅ ราคาต่อหน่วย ราคารวม และเงื่อนไขยอดรวม/ก่อน VAT คำนวณเป็นสตางค์ถูกต้อง");
    return;
  }

  const { prisma } = await import("@lamunn/db-finance");
  const suffix = randomUUID().slice(0, 8);
  let invoiceId: string | null = null;

  try {
    const summary = summarizePurchaseTaxLineItems([
      { category: "RAW_MATERIAL", description: "[test] แป้ง", quantity: "2", unitPrice: "100.50", lineTotal: "214.01", priceCondition: "VAT", totalCondition: "VAT_INCLUDED", vatRatePercent: "7" },
      { category: "PACKAGING", description: "[test] กล่องยกเว้น VAT", quantity: "3", unitPrice: "20", priceCondition: "VAT_EXEMPT" },
      { category: "OTHER", description: "[test] ของแถม", quantity: "1", unitPrice: "", priceCondition: "FREE" },
    ], 0.07, "UP");

    if (summary.errors.length > 0) throw new Error(summary.errors.join(", "));
    if (summary.baseSatang !== 26_001 || summary.vatSatang !== 1_401 || summary.totalSatang !== 27_402) {
      throw new Error(`ยอดรวมผิด: base=${summary.baseSatang} vat=${summary.vatSatang} total=${summary.totalSatang}`);
    }

    const invoice = await prisma.accPurchaseTaxInvoice.create({
      data: {
        invoiceNo: `[test]-ITEMS-${suffix}`,
        invoiceDate: new Date(Date.UTC(YEAR, 0, 12)),
        claimPeriod: new Date(Date.UTC(YEAR, 0, 1)),
        vendorName: `[test] ผู้ขาย ${suffix}`,
        description: "[test] รายละเอียดสินค้าหลายบรรทัด",
        lineItems: summary.items as unknown as Prisma.InputJsonValue,
        baseAmount: toBaht(summary.baseSatang),
        vatAmount: toBaht(summary.vatSatang),
        totalAmount: toBaht(summary.totalSatang),
      },
    });
    invoiceId = invoice.id;

    const saved = await prisma.accPurchaseTaxInvoice.findUnique({ where: { id: invoice.id } });
    if (!saved || !Array.isArray(saved.lineItems) || saved.lineItems.length !== 3) {
      throw new Error("รายละเอียดสินค้าที่บันทึกไว้ไม่ครบ 3 บรรทัด");
    }
    const firstSavedItem = saved.lineItems[0] as Record<string, unknown>;
    if (firstSavedItem.unitPriceDecimal !== "100.50" || firstSavedItem.lineTotalOverridden !== true || totalConditionFromSnapshot(firstSavedItem) !== "VAT_INCLUDED" || lineTotalInputFromSnapshot(firstSavedItem) !== "214.01") {
      throw new Error("snapshot ไม่ได้เก็บราคาต่อหน่วย เงื่อนไขยอดรวมภาษี และราคารวมที่แก้เอง");
    }
    if (Number(saved.baseAmount) !== 260.01 || Number(saved.vatAmount) !== 14.01 || Number(saved.totalAmount) !== 274.02) {
      throw new Error("ยอดในฐานข้อมูลไม่ตรงกับรายละเอียดสินค้า");
    }

    console.log("✅ รายละเอียดสินค้า เงื่อนไขยอดรวม/ก่อน VAT และ snapshot ถูกต้อง");
  } finally {
    if (invoiceId) await prisma.accPurchaseTaxInvoice.delete({ where: { id: invoiceId } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
