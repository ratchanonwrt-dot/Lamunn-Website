/** พิสูจน์ว่าใบกำกับภาษีซื้อที่อ้างถึงใบสำคัญเก่าซึ่งไม่มีแล้ว ยังยกเลิกได้
 *
 * รัน: npx tsx scripts/verify-purchase-invoice-stale-entry-void.ts
 */
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const YEAR = 2095;

async function main() {
  const [{ prisma }, { voidPurchaseTaxInvoice }] = await Promise.all([
    import("@lamunn/db-finance"),
    import("../src/lib/accounting/purchaseInvoiceVoid"),
  ]);
  const suffix = randomUUID().slice(0, 8);
  let invoiceId: string | null = null;

  try {
    const invoice = await prisma.accPurchaseTaxInvoice.create({
      data: {
        invoiceNo: `[test]-STALE-${suffix}`,
        invoiceDate: new Date(Date.UTC(YEAR, 0, 10)),
        claimPeriod: new Date(Date.UTC(YEAR, 0, 1)),
        vendorName: `[test] ผู้ขาย ${suffix}`,
        description: "[test] ใบสำคัญอ้างอิงหาย",
        baseAmount: 1000,
        vatAmount: 70,
        totalAmount: 1070,
        entryId: `[test]-missing-entry-${suffix}`,
      },
    });
    invoiceId = invoice.id;

    await voidPurchaseTaxInvoice(invoice.id);
    const result = await prisma.accPurchaseTaxInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    if (!result.voided) throw new Error("ใบกำกับที่มีลิงก์ใบสำคัญค้างยังไม่ถูกยกเลิก");
    console.log("✅ ใบกำกับที่อ้างถึงใบสำคัญซึ่งไม่มีแล้ว ยกเลิกได้สำเร็จ");
  } finally {
    if (invoiceId) await prisma.accPurchaseTaxInvoice.delete({ where: { id: invoiceId } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
