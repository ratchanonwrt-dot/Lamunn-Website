import assert from "node:assert/strict";
import { activePartnerBranches, resolvePartnerBranch } from "../src/lib/accounting/partnerBranchSelection";

const branches = [
  { id: "[test]-head", branchTag: "สำนักงานใหญ่", address: "[test] ที่อยู่สำนักงานใหญ่", isDefault: true, isActive: true },
  { id: "[test]-branch-2", branchTag: "00002", address: "[test] ที่อยู่สาขา 00002", isDefault: false, isActive: true },
  { id: "[test]-closed", branchTag: "00003", address: "[test] ที่อยู่สาขาปิด", isDefault: false, isActive: false },
];

try {
  const partner = { branchTag: "สำนักงานใหญ่", address: "[test] ที่อยู่เดิม", branches };
  const initial = resolvePartnerBranch(partner);
  assert.equal(initial.partnerBranchId, "[test]-head");
  assert.equal(initial.address, "[test] ที่อยู่สำนักงานใหญ่");

  const changed = resolvePartnerBranch(partner, "[test]-branch-2");
  assert.equal(changed.partnerBranchId, "[test]-branch-2");
  assert.equal(changed.branchTag, "00002");
  assert.equal(changed.address, "[test] ที่อยู่สาขา 00002");
  assert.deepEqual(activePartnerBranches(partner).map((branch) => branch.id), ["[test]-head", "[test]-branch-2"]);

  console.log("PASS: เลือกสาขาคู่ค้าแล้วชื่อสาขาและที่อยู่เปลี่ยนตาม branchId");
} finally {
  branches.splice(0, branches.length);
}
