/** พิสูจน์ว่าเมนูขายทุกช่องทางมี sheet ครบและลิงก์ที่ไม่ถูกต้องกลับมาหน้าสรุป */
import assert from "node:assert/strict";
import { ALL_CHANNEL_SALES_CASH_BRANCHES, ALL_CHANNEL_SALES_CASH_FIXED_COLUMNS, ALL_CHANNEL_SALES_LINKS, ALL_CHANNEL_SALES_POS_COLUMNS, ALL_CHANNEL_SALES_SHEETS, ALL_CHANNEL_SALES_SUMMARY_COLUMNS, buildAllChannelPosRows, resolveAllChannelSalesSheet } from "../src/lib/accounting/allChannelSales";

const expected = ["สรุปยอดขาย", "POS", "Cash", "Grab", "Line man", "credit card", "E-wallet", "KSHOP_QR EDC", "The mall", "Tops", "Cateringและอื่นๆ", "Tiktok"];
assert.deepEqual(ALL_CHANNEL_SALES_SHEETS.map((sheet) => sheet.label), expected);
assert.deepEqual(ALL_CHANNEL_SALES_SUMMARY_COLUMNS, ["ลำดับ", "สาขา", "มูลค่าก่อนภาษี", "ภาษี 7%", "มูลค่ารวมภาษี"]);
assert.deepEqual(ALL_CHANNEL_SALES_POS_COLUMNS, ["ลำดับ", "ช่องทาง", "มูลค่ารวมภาษี"]);
assert.deepEqual(ALL_CHANNEL_SALES_CASH_FIXED_COLUMNS, ["ลำดับ", "รายการ"]);
assert.equal(ALL_CHANNEL_SALES_CASH_BRANCHES.length, 33);
assert.equal(ALL_CHANNEL_SALES_CASH_BRANCHES[0], "อโศก");
assert.equal(ALL_CHANNEL_SALES_CASH_BRANCHES.at(-1), "วางบิล The mall");
assert.equal(ALL_CHANNEL_SALES_LINKS.taxInvoices, "/accounting/tax-invoices");
assert.equal(ALL_CHANNEL_SALES_LINKS.summary, "/accounting/all-channel-sales?sheet=summary");
assert.equal(resolveAllChannelSalesSheet("grab").label, "Grab");
assert.equal(resolveAllChannelSalesSheet("[test]-ไม่พบ").key, "summary");
assert.deepEqual(buildAllChannelPosRows(71_163_600), [{ sequence: 1, channel: "Cash", grossAmount: 71_163_600 }]);
console.log("✅ verify-all-channel-sales ผ่านทั้งหมด");
