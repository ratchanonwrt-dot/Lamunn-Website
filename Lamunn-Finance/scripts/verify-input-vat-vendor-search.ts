/** พิสูจน์การค้นหาผู้ขายและยอดรวมของผลลัพธ์ โดยไม่แตะฐานข้อมูล */
import assert from "node:assert/strict";
import type { InputVatReport, InputVatRow } from "../src/lib/accounting/taxReports";
import { filterInputVatReportByVendor } from "../src/lib/accounting/inputVatVendorSearch";

const row = (input: Partial<InputVatRow> & Pick<InputVatRow, "id" | "vendorName">): InputVatRow => ({
  id: input.id,
  kind: input.kind ?? "DOC",
  date: input.date ?? new Date("2091-01-15T00:00:00.000Z"),
  invoiceNo: input.invoiceNo ?? `[test]-${input.id}`,
  entryNo: input.entryNo ?? null,
  vendorName: input.vendorName,
  taxId: input.taxId ?? null,
  branchTag: input.branchTag ?? null,
  description: input.description ?? "[test] รายการภาษีซื้อ",
  base: input.base ?? 10_000,
  vat: input.vat ?? 700,
  total: input.total ?? 10_700,
  isClaimable: input.isClaimable ?? true,
});

const rows = [
  row({ id: "central", invoiceNo: "TAX-2091-00014", vendorName: "[test] บริษัท เซ็นทรัลพัฒนา จำกัด", taxId: "0107537002443", branchTag: "สาขา 00014", base: 252_336, vat: 17_664, total: 270_000 }),
  row({ id: "bakery", invoiceNo: "BAKERY-2091-001", vendorName: "[test] ร้านวัตถุดิบเบเกอรี่", taxId: "0123456789012", branchTag: "สำนักงานใหญ่", isClaimable: false, base: 5_000, vat: 350 }),
  row({ id: "ai", kind: "AI_AUTOKEY", vendorName: "[test] ผู้ขายจาก AI", base: 3_000, vat: 210 }),
];
const report: InputVatReport = { rows, totalBase: 260_336, totalVat: 18_224, claimableVat: 17_874, nonClaimableVat: 350, docCount: 2, aiAutokeyCount: 1 };

const byName = filterInputVatReportByVendor(report, "เซ็นทรัล");
assert.deepEqual(byName.rows.map((item) => item.id), ["central"]);
assert.equal(byName.totalBase, 252_336);
assert.equal(byName.totalVat, 17_664);
assert.equal(byName.docCount, 1);

assert.deepEqual(filterInputVatReportByVendor(report, "010-7537-002443").rows.map((item) => item.id), ["central"], "เลขผู้เสียภาษีค้นได้แม้พิมพ์ขีด");
assert.deepEqual(filterInputVatReportByVendor(report, "00014").rows.map((item) => item.id), ["central"], "ค้นด้วยสาขาได้");
assert.deepEqual(filterInputVatReportByVendor(report, "เซ็นทรัล 00014").rows.map((item) => item.id), ["central"], "พิมพ์ชื่อและสาขาพร้อมกันได้");
assert.deepEqual(filterInputVatReportByVendor(report, "TAX-2091-00014").rows.map((item) => item.id), ["central"], "ค้นด้วยเลขที่ใบกำกับได้");
assert.deepEqual(filterInputVatReportByVendor(report, "2,523.36").rows.map((item) => item.id), ["central"], "ค้นมูลค่าก่อนภาษีแบบมีจุลภาคได้");
assert.deepEqual(filterInputVatReportByVendor(report, "176.64").rows.map((item) => item.id), ["central"], "ค้นด้วยยอดภาษีซื้อได้");
assert.deepEqual(filterInputVatReportByVendor(report, "2,700.00").rows.map((item) => item.id), ["central"], "ค้นด้วยยอดรวมภาษีได้");
assert.deepEqual(filterInputVatReportByVendor(report, "เซ็นทรัล 2,523.36").rows.map((item) => item.id), ["central"], "ค้นชื่อและจำนวนเงินพร้อมกันได้");
assert.equal(filterInputVatReportByVendor(report, "สำนักงานใหญ่").nonClaimableVat, 350, "ยอดภาษีซื้อต้องห้ามต้องคำนวณตามผลค้นหา");
assert.equal(filterInputVatReportByVendor(report, "").rows.length, 3, "คำค้นว่างต้องแสดงครบ");

console.log("✅ verify-input-vat-vendor-search ผ่านทั้งหมด");
