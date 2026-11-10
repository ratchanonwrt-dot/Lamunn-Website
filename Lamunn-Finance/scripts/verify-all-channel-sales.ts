/** พิสูจน์ว่าเมนูขายทุกช่องทางมี sheet ครบและลิงก์ที่ไม่ถูกต้องกลับมาหน้าสรุป */
import assert from "node:assert/strict";
import { ALL_CHANNEL_SALES_SHEETS, ALL_CHANNEL_SALES_SUMMARY_COLUMNS, resolveAllChannelSalesSheet } from "../src/lib/accounting/allChannelSales";

const expected = ["สรุปยอดขาย", "POS", "Cash", "Grab", "Line man", "credit card", "E-wallet", "KSHOP_QR EDC", "The mall", "Tops", "Cateringและอื่นๆ", "Tiktok"];
assert.deepEqual(ALL_CHANNEL_SALES_SHEETS.map((sheet) => sheet.label), expected);
assert.deepEqual(ALL_CHANNEL_SALES_SUMMARY_COLUMNS, ["ลำดับ", "สาขา", "มูลค่าก่อนภาษี", "ภาษี 7%", "มูลค่ารวมภาษี"]);
assert.equal(resolveAllChannelSalesSheet("grab").label, "Grab");
assert.equal(resolveAllChannelSalesSheet("[test]-ไม่พบ").key, "summary");
console.log("✅ verify-all-channel-sales ผ่านทั้งหมด");
