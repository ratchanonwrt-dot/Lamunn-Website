/** พิสูจน์ว่ารายงานอ่านรายละเอียดจากใบกำกับภาษีซื้อ แยกหมวด และไม่รวมใบที่ยกเลิก
 *
 * รัน: npx tsx scripts/verify-purchase-item-report.ts
 */
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { Prisma } from "@lamunn/db-finance";

loadEnvConfig(process.cwd());

const YEAR = 2099;

async function main() {
  const { prisma } = await import("@lamunn/db-finance");
  const { filterPurchaseItemReport, flattenPurchaseItemInvoices, loadPurchaseItemReport, purchaseItemReportFilters } = await import("../src/lib/accounting/purchaseItemReport");
  const suffix = randomUUID().slice(0, 8);
  const createdIds: string[] = [];

  // เครื่อง Windows บางเครื่องเปิด TLS ไป Supabase ไม่ได้ จึงมีโหมดพิสูจน์ตัวแปลงข้อมูลโดยไม่เขียน DB
  // ส่วนการรันปกติด้านล่างยังสร้าง → ตรวจ → ลบข้อมูลปี 2099 ตามกติกาเดิมครบถ้วน
  if (process.argv.includes("--pure")) {
    const report = flattenPurchaseItemInvoices([{
      id: `[test]-PURE-${suffix}`,
      invoiceDate: new Date(Date.UTC(YEAR, 6, 1)),
      invoiceNo: `[test]-PURE-${suffix}`,
      vendorName: "[test] ซัพพลายเออร์",
      vendorBranchTag: "00014",
      lineItems: [
        { category: "RAW_MATERIAL", description: "[test] แป้ง", quantity: "2", unitPriceDecimal: "12.5506123456", unitPriceSubSatang: 125506, unitPriceSatang: 1255, priceCondition: "VAT" },
        { category: "PACKAGING", description: "[test] กล่อง", quantity: "3.5", unitPriceSatang: 2000, priceCondition: "VAT_EXEMPT" },
      ],
    }]);
    if (report.rows.length !== 2 || report.rows[0].category !== "RAW_MATERIAL" || report.rows[1].quantity !== "3.5") {
      throw new Error("ตัวแปลงข้อมูลรายงานไม่ถูกต้อง");
    }
    if (report.rows[0].unitPriceDecimal !== "12.5506123456" || report.rows[1].unitPriceDecimal !== "20.0000") {
      throw new Error("รายงานต้องอ่านราคาใหม่ 10 ตำแหน่งและราคาเก่าร่วมกันได้");
    }
    const filtered = filterPurchaseItemReport(report, "บรรจุ");
    if (filtered.rows.length !== 1 || filtered.rows[0].category !== "PACKAGING") throw new Error("ตัวกรองหมวดแบบพิมพ์ค้นหาไม่ถูกต้อง");
    const filters = purchaseItemReportFilters({ from: "2099-07-20", to: "2099-07-01", category: "วัตถุ" });
    if (filters.from !== "2099-07-01" || filters.to !== "2099-07-20") throw new Error("ช่วงวันที่สลับลำดับไม่ถูกต้อง");
    console.log("✅ ตัวแปลงข้อมูล ช่วงวันที่ และตัวกรองหมวดแบบพิมพ์ค้นหาถูกต้อง");
    await prisma.$disconnect();
    return;
  }

  try {
    const active = await prisma.accPurchaseTaxInvoice.create({
      data: {
        invoiceNo: `[test]-REPORT-${suffix}`,
        invoiceDate: new Date(Date.UTC(YEAR, 6, 10)),
        claimPeriod: new Date(Date.UTC(YEAR, 6, 1)),
        vendorName: `[test] ซัพพลายเออร์ ${suffix}`,
        vendorBranchTag: "00014",
        description: "[test] รายละเอียดรายงาน",
        lineItems: [
          { category: "RAW_MATERIAL", description: "[test] แป้ง", quantity: "2", unitPriceDecimal: "12.5506123456", unitPriceSubSatang: 125506, unitPriceSatang: 1255, priceCondition: "VAT", vatRatePercent: "7", baseSatang: 2510, vatSatang: 176, totalSatang: 2686 },
          { category: "PACKAGING", description: "[test] กล่อง", quantity: "3.5", unitPriceSatang: 2000, priceCondition: "VAT_EXEMPT", vatRatePercent: "0", baseSatang: 7000, vatSatang: 0, totalSatang: 7000 },
        ] as Prisma.InputJsonValue,
        baseAmount: 321.01,
        vatAmount: 17.57,
        totalAmount: 338.58,
      },
    });
    createdIds.push(active.id);

    const voided = await prisma.accPurchaseTaxInvoice.create({
      data: {
        invoiceNo: `[test]-VOID-${suffix}`,
        invoiceDate: new Date(Date.UTC(YEAR, 6, 11)),
        claimPeriod: new Date(Date.UTC(YEAR, 6, 1)),
        vendorName: `[test] ยกเลิก ${suffix}`,
        description: "[test] ต้องไม่แสดง",
        lineItems: [{ category: "OTHER", description: "[test] ไม่แสดง", quantity: "1", unitPriceSatang: 9999, priceCondition: "VAT", vatRatePercent: "7", baseSatang: 9999, vatSatang: 700, totalSatang: 10699 }] as Prisma.InputJsonValue,
        baseAmount: 99.99,
        vatAmount: 7,
        totalAmount: 106.99,
        voided: true,
      },
    });
    createdIds.push(voided.id);

    const report = await loadPurchaseItemReport(new Date(Date.UTC(YEAR, 6, 1)), new Date(Date.UTC(YEAR, 6, 31, 23, 59, 59, 999)), "วัตถุ");
    const ownRows = report.rows.filter((row) => row.invoiceId === active.id);
    if (ownRows.length !== 1) throw new Error(`ควรพบวัตถุดิบ 1 บรรทัด แต่พบ ${ownRows.length}`);
    if (ownRows[0].category !== "RAW_MATERIAL") throw new Error("ตัวกรองหมวดรายการไม่ถูกต้อง");
    if (report.rows.some((row) => row.invoiceId === voided.id)) throw new Error("ใบที่ยกเลิกไม่ควรแสดงในรายงาน");
    if (ownRows[0].unitPriceDecimal !== "12.5506123456" || ownRows[0].quantity !== "2") throw new Error("จำนวนหรือราคาต่อหน่วย 10 ตำแหน่งไม่ตรง snapshot");
    if (ownRows[0].vendorBranchTag !== "00014") throw new Error("สาขาซัพพลายเออร์ไม่ถูกต้อง");
    console.log("✅ รายงานดึงรายละเอียดตามช่วงวันที่ กรองหมวด และตัดใบยกเลิกถูกต้อง");
  } finally {
    for (const id of createdIds.reverse()) {
      await prisma.accPurchaseTaxInvoice.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
