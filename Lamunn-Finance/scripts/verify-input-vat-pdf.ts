/**
 * พิสูจน์หน้าพิมพ์รายงานภาษีซื้อ:
 * - ใช้เอกสารจริงใน DB dev เพื่อยืนยันว่า report builder อ่านข้อมูลได้
 * - เลขที่ใบกำกับ ชื่อผู้ขาย เลขผู้เสียภาษี และเงินหน่วยสตางค์ถูกส่งไปหน้าพิมพ์ครบ
 * - ลบเฉพาะ id ที่สคริปต์นี้สร้างใน finally
 *
 * รันจาก Lamunn-Finance: npx tsx scripts/verify-input-vat-pdf.ts
 */
import assert from "node:assert/strict";
import { prisma } from "@lamunn/db-finance";
import { monthRange } from "../src/lib/dates";
import { buildInputVatPrintRows, INPUT_VAT_PRINT_HEADERS } from "../src/lib/accounting/inputVatPrint";
import { buildInputVatReport } from "../src/lib/accounting/taxReports";

const YEAR = 2091;
const MONTH = 1;
let invoiceId: string | null = null;

async function main() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const invoiceNo = `[test]-INPUT-VAT-PDF-${suffix}`;
  const invoice = await prisma.accPurchaseTaxInvoice.create({
    data: {
      invoiceNo,
      invoiceDate: new Date(Date.UTC(YEAR, MONTH - 1, 15)),
      vendorName: "[test] ผู้ขายรายงาน PDF",
      vendorTaxId: "0105568147638",
      vendorBranchTag: "สำนักงานใหญ่",
      description: "[test] สินค้าสำหรับพิสูจน์รายงาน PDF",
      baseAmount: "1234.56",
      vatAmount: "86.42",
      totalAmount: "1320.98",
    },
  });
  invoiceId = invoice.id;

  const { start, end } = monthRange(YEAR, MONTH - 1);
  const report = await buildInputVatReport(start, end);
  const sourceRow = report.rows.find((row) => row.id === invoice.id);
  assert(sourceRow, "ต้องพบเอกสารทดสอบในรายงานภาษีซื้อ");

  const [printRow] = buildInputVatPrintRows([sourceRow]);
  assert.deepEqual(INPUT_VAT_PRINT_HEADERS, [
    "ลำดับ",
    "วันที่",
    "เลขที่ใบกำกับ",
    "ชื่อผู้ขาย",
    "เลขผู้เสียภาษี",
    "มูลค่าสินค้า/บริการ",
    "ภาษีซื้อ",
  ]);
  assert.equal(printRow.order, 1);
  assert.equal(printRow.date, "15/01/2091");
  assert.equal(printRow.invoiceNo, invoiceNo);
  assert.equal(printRow.vendorName, "[test] ผู้ขายรายงาน PDF (สำนักงานใหญ่)");
  assert.equal(printRow.taxId, "0105568147638");
  assert.equal(printRow.base, 123456, "มูลค่าต้องคงเป็นจำนวนเต็มหน่วยสตางค์");
  assert.equal(printRow.vat, 8642, "ภาษีซื้อต้องคงเป็นจำนวนเต็มหน่วยสตางค์");

  console.log("✓ รายงานพิมพ์มีหัวตารางครบ 7 คอลัมน์และใช้ข้อมูลภาษีซื้อจริง");
  console.log("✓ เงินคงเป็นจำนวนเต็มหน่วยสตางค์จนถึงชั้นแสดงผล");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (invoiceId) {
      await prisma.accPurchaseTaxInvoice.delete({ where: { id: invoiceId } }).catch((error) => {
        console.error(`ลบข้อมูลทดสอบ id=${invoiceId} ไม่สำเร็จ`, error);
        process.exitCode = 1;
      });
    }
    await prisma.$disconnect();
  });
