/** พิสูจน์รายละเอียดใบกำกับภาษีซื้อหลายบรรทัด เงื่อนไข VAT และการเก็บ snapshot
 *
 * รัน: npx tsx scripts/verify-purchase-tax-line-items.ts
 */
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { Prisma } from "@lamunn/db-finance";
import { summarizePurchaseTaxLineItems } from "../src/lib/accounting/purchaseTaxLineItems";
import { toBaht } from "../src/lib/accounting/money";

loadEnvConfig(process.cwd());

const YEAR = 2098;

async function main() {
  const { prisma } = await import("@lamunn/db-finance");
  const suffix = randomUUID().slice(0, 8);
  let invoiceId: string | null = null;

  try {
    const summary = summarizePurchaseTaxLineItems([
      { category: "RAW_MATERIAL", description: "[test] แป้ง", quantity: "2", unitPrice: "100.50", priceCondition: "VAT", vatRatePercent: "7" },
      { category: "PACKAGING", description: "[test] กล่องยกเว้น VAT", quantity: "3", unitPrice: "20", priceCondition: "VAT_EXEMPT" },
      { category: "OTHER", description: "[test] ของแถม", quantity: "1", unitPrice: "", priceCondition: "FREE" },
    ], 0.07, "UP");

    if (summary.errors.length > 0) throw new Error(summary.errors.join(", "));
    if (summary.baseSatang !== 26_100 || summary.vatSatang !== 1_408 || summary.totalSatang !== 27_508) {
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
    if (Number(saved.baseAmount) !== 261 || Number(saved.vatAmount) !== 14.08 || Number(saved.totalAmount) !== 275.08) {
      throw new Error("ยอดในฐานข้อมูลไม่ตรงกับรายละเอียดสินค้า");
    }

    console.log("✅ รายละเอียดสินค้า เงื่อนไข VAT ยอดรวม และ snapshot ถูกต้อง");
  } finally {
    if (invoiceId) await prisma.accPurchaseTaxInvoice.delete({ where: { id: invoiceId } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
