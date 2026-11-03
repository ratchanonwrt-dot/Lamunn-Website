/** พิสูจน์การปรับภาษีซื้อขึ้น/ลงครั้งละหนึ่งสตางค์ และบันทึกยอดรวมได้ตรงสูตร
 *
 * รัน: npx tsx scripts/verify-purchase-tax-rounding.ts
 */
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { addVatExclusive, toBaht } from "../src/lib/accounting/money";

loadEnvConfig(process.cwd());

const YEAR = 2096;

async function main() {
  const { prisma } = await import("@lamunn/db-finance");
  const suffix = randomUUID().slice(0, 8);
  const invoiceIds: string[] = [];

  try {
    const upward = addVatExclusive(10_100, 0.07, "UP");
    const downward = addVatExclusive(10_100, 0.07, "DOWN");
    if (upward.vat !== 708 || downward.vat !== 706) {
      throw new Error(`ผลปัดภาษีไม่ถูกต้อง: ขึ้น=${upward.vat} ลง=${downward.vat}`);
    }

    const exactUpward = addVatExclusive(10_000, 0.07, "UP");
    const exactDownward = addVatExclusive(10_000, 0.07, "DOWN");
    if (exactUpward.vat !== 701 || exactDownward.vat !== 699) {
      throw new Error(`ผลปรับภาษีหนึ่งสตางค์ไม่ถูกต้อง: ขึ้น=${exactUpward.vat} ลง=${exactDownward.vat}`);
    }

    for (const [mode, calculated] of [["UP", upward], ["DOWN", downward]] as const) {
      const invoice = await prisma.accPurchaseTaxInvoice.create({
        data: {
          invoiceNo: `[test]-ROUND-${mode}-${suffix}`,
          invoiceDate: new Date(Date.UTC(YEAR, 0, mode === "UP" ? 10 : 11)),
          claimPeriod: new Date(Date.UTC(YEAR, 0, 1)),
          vendorName: `[test] ผู้ขาย ${suffix}`,
          description: `[test] ปัดภาษี ${mode}`,
          baseAmount: toBaht(calculated.base),
          vatAmount: toBaht(calculated.vat),
          totalAmount: toBaht(calculated.base + calculated.vat),
        },
      });
      invoiceIds.push(invoice.id);
      if (Number(invoice.totalAmount) !== Number(invoice.baseAmount) + Number(invoice.vatAmount)) {
        throw new Error(`ยอดรวม ${mode} ไม่เท่ากับยอดก่อนภาษีบวกภาษี`);
      }
    }
    console.log("✅ ปัดภาษีขึ้น/ลงและยอดรวมถูกต้อง");
  } finally {
    for (const id of invoiceIds.reverse()) {
      await prisma.accPurchaseTaxInvoice.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
