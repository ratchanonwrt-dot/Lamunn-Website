import assert from "node:assert/strict";
import {
  PurchaseTaxAccountAllocationError,
  resolvePurchaseTaxAccountAllocations,
} from "../src/lib/accounting/purchaseTaxAccountAllocation";

try {
  const split = resolvePurchaseTaxAccountAllocations([
    { accountId: "[test]-expense-1", amount: "600.25" },
    { accountId: "[test]-expense-2", amount: "399.75" },
  ], 100_000);
  assert.deepEqual(split, [
    { accountId: "[test]-expense-1", amountSatang: 60_025 },
    { accountId: "[test]-expense-2", amountSatang: 39_975 },
  ]);

  const singleBlank = resolvePurchaseTaxAccountAllocations([
    { accountId: "[test]-expense-1", amount: "" },
  ], -100_000);
  assert.deepEqual(singleBlank, [{ accountId: "[test]-expense-1", amountSatang: 100_000 }]);

  const legacy = resolvePurchaseTaxAccountAllocations(undefined, 100_000, "[test]-legacy-expense");
  assert.deepEqual(legacy, [{ accountId: "[test]-legacy-expense", amountSatang: 100_000 }]);

  assert.throws(
    () => resolvePurchaseTaxAccountAllocations([
      { accountId: "[test]-expense-1", amount: "600" },
      { accountId: "[test]-expense-2", amount: "300" },
    ], 100_000),
    (error) => error instanceof PurchaseTaxAccountAllocationError && error.message.includes("ยังขาด 100.00"),
  );

  assert.throws(
    () => resolvePurchaseTaxAccountAllocations([
      { accountId: "[test]-expense-1", amount: "500" },
      { accountId: "[test]-expense-1", amount: "500" },
    ], 100_000),
    (error) => error instanceof PurchaseTaxAccountAllocationError && error.message.includes("ซ้ำ"),
  );

  console.log("PASS: แบ่งฐานก่อน VAT หลายบัญชีเป็นสตางค์ ยอดรวมสมดุล และรองรับข้อมูลเดิม");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
