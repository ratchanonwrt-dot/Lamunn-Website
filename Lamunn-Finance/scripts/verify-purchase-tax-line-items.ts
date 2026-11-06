/** พิสูจน์รายละเอียดใบกำกับภาษีซื้อหลายบรรทัด เงื่อนไข VAT และการเก็บ snapshot
 *
 * รัน: npx tsx scripts/verify-purchase-tax-line-items.ts
 */
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { Prisma } from "@lamunn/db-finance";
import { lineTotalInputFromSnapshot, summarizePurchaseTaxLineItems } from "../src/lib/accounting/purchaseTaxLineItems";
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

async function main() {
  checkTenDecimalUnitPrice();
  checkEditableLineTotal();
  if (process.argv.includes("--pure")) {
    console.log("✅ ราคาต่อหน่วย 10 ตำแหน่งและราคารวมที่แก้เองคำนวณเป็นสตางค์ถูกต้อง");
    return;
  }

  const { prisma } = await import("@lamunn/db-finance");
  const suffix = randomUUID().slice(0, 8);
  let invoiceId: string | null = null;

  try {
    const summary = summarizePurchaseTaxLineItems([
      { category: "RAW_MATERIAL", description: "[test] แป้ง", quantity: "2", unitPrice: "100.50", lineTotal: "200.01", priceCondition: "VAT", vatRatePercent: "7" },
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
    if (firstSavedItem.unitPriceDecimal !== "100.50" || firstSavedItem.lineTotalOverridden !== true || lineTotalInputFromSnapshot(firstSavedItem) !== "200.01") {
      throw new Error("snapshot ไม่ได้เก็บราคาต่อหน่วยและราคารวมที่แก้เอง");
    }
    if (Number(saved.baseAmount) !== 260.01 || Number(saved.vatAmount) !== 14.01 || Number(saved.totalAmount) !== 274.02) {
      throw new Error("ยอดในฐานข้อมูลไม่ตรงกับรายละเอียดสินค้า");
    }

    console.log("✅ รายละเอียดสินค้า ราคา 10 ตำแหน่ง เงื่อนไข VAT ยอดรวม และ snapshot ถูกต้อง");
  } finally {
    if (invoiceId) await prisma.accPurchaseTaxInvoice.delete({ where: { id: invoiceId } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
