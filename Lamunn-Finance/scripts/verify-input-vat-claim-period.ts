/** พิสูจน์ว่าใบกำกับภาษีซื้อใช้วันที่เอกสารจริง แต่เลือกงวดเคลมเดือนถัดไปได้
 *
 * ข้อมูลปี ค.ศ. 2094 เท่านั้น และลบเฉพาะ id ที่สคริปต์สร้างใน finally
 * รัน: npx tsx scripts/verify-input-vat-claim-period.ts (จากโฟลเดอร์ Lamunn-Finance)
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const YEAR = 2094;
let fails = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? "ผ่าน  " : "ไม่ผ่าน ❌"}  ${label}${ok ? "" : ` (ได้ ${JSON.stringify(actual)} ควรเป็น ${JSON.stringify(expected)})`}`);
  if (!ok) fails++;
}

async function main() {
  const [{ prisma }, { buildInputVatReport }, { monthRange }, { parsePurchaseTaxClaimPeriod }, { updatePurchaseInvoice }] = await Promise.all([
    import("@lamunn/db-finance"),
    import("../src/lib/accounting/taxReports"),
    import("../src/lib/dates"),
    import("../src/lib/accounting/purchaseTaxClaimPeriod"),
    import("../src/lib/accounting/purchaseInvoiceEdit"),
  ]);
  const invoiceIds: string[] = [];

  try {
    const deferred = await prisma.accPurchaseTaxInvoice.create({
      data: {
        invoiceNo: "[test] CLAIM-001",
        invoiceDate: new Date(Date.UTC(YEAR, 6, 15)),
        claimPeriod: new Date(Date.UTC(YEAR, 7, 1)),
        vendorName: "[test] ผู้ขายงวดถัดไป",
        description: "[test] ใบกำกับเดือนกรกฎาคมเคลมสิงหาคม",
        baseAmount: 1000,
        vatAmount: 70,
        totalAmount: 1070,
      },
    });
    invoiceIds.push(deferred.id);

    const legacy = await prisma.accPurchaseTaxInvoice.create({
      data: {
        invoiceNo: "[test] CLAIM-LEGACY",
        invoiceDate: new Date(Date.UTC(YEAR, 6, 20)),
        claimPeriod: null,
        vendorName: "[test] ผู้ขายข้อมูลเก่า",
        description: "[test] ข้อมูลก่อนมีงวดเคลม",
        baseAmount: 2000,
        vatAmount: 140,
        totalAmount: 2140,
      },
    });
    invoiceIds.push(legacy.id);

    const julyRange = monthRange(YEAR, 6);
    const augustRange = monthRange(YEAR, 7);
    const july = await buildInputVatReport(julyRange.start, julyRange.end);
    const august = await buildInputVatReport(augustRange.start, augustRange.end);

    console.log("\n=== เลือกงวดเคลมแยกจากวันที่ใบกำกับ ===");
    check("ใบกำกับกรกฎาคมที่เลือกเคลมสิงหาคมไม่อยู่รายงานกรกฎาคม", july.rows.some((row) => row.id === deferred.id), false);
    check("ใบกำกับกรกฎาคมที่เลือกเคลมสิงหาคมอยู่รายงานสิงหาคม", august.rows.some((row) => row.id === deferred.id), true);
    check("รายงานสิงหาคมยังแสดงวันที่จริงบนใบกำกับ", august.rows.find((row) => row.id === deferred.id)?.date.toISOString().slice(0, 10), `${YEAR}-07-15`);
    check("ข้อมูลเก่าที่ไม่มีงวดเคลมยังอยู่ตามเดือนใบกำกับ", july.rows.some((row) => row.id === legacy.id), true);

    await updatePurchaseInvoice(deferred.id, { claimPeriod: `${YEAR}-09` }, { vatRate: 7 });
    const septemberRange = monthRange(YEAR, 8);
    const augustAfterEdit = await buildInputVatReport(augustRange.start, augustRange.end);
    const september = await buildInputVatReport(septemberRange.start, septemberRange.end);
    check("เปลี่ยนงวดจากสิงหาคมเป็นกันยายนแล้วออกจากรายงานสิงหาคม", augustAfterEdit.rows.some((row) => row.id === deferred.id), false);
    check("เปลี่ยนงวดแล้วเข้ารายงานกันยายน", september.rows.some((row) => row.id === deferred.id), true);

    let rejected = false;
    try {
      parsePurchaseTaxClaimPeriod(`${YEAR}-06`, new Date(Date.UTC(YEAR, 6, 15)));
    } catch {
      rejected = true;
    }
    check("ห้ามเลือกงวดก่อนเดือนของใบกำกับ", rejected, true);
  } finally {
    for (const id of invoiceIds) {
      await prisma.accPurchaseTaxInvoice.delete({ where: { id } }).catch(() => undefined);
    }
  }

  console.log(fails === 0 ? "\n✅ ผ่านทั้งหมด\n" : `\n❌ ไม่ผ่าน ${fails} ข้อ\n`);
  process.exit(fails === 0 ? 0 : 1);
}

main();
