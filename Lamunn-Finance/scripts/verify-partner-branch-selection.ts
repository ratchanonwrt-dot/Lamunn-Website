import assert from "node:assert/strict";
import {
  activePartnerBranches,
  partnerBranchChoices,
  resolvePartnerBranch,
  resolvePartnerBranchChoice,
} from "../src/lib/accounting/partnerBranchSelection";

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

  const legacyPartner = {
    id: "[test]-legacy-partner",
    branchTag: null,
    address: "[test] ที่อยู่คู่ค้าเก่า",
    branches: [],
  };
  const legacyBranches = activePartnerBranches(legacyPartner);
  assert.equal(legacyBranches.length, 1);
  assert.equal(legacyBranches[0].branchTag, "สำนักงานใหญ่");
  assert.equal(legacyBranches[0].isDefault, true);
  assert.equal(resolvePartnerBranch(legacyPartner).address, "[test] ที่อยู่คู่ค้าเก่า");

  const legacyPartners = [
    { id: "[test]-partner-head", taxId: "0100000000001", branchTag: "สำนักงานใหญ่", address: "[test] ที่อยู่สำนักงานใหญ่", branches: [] },
    { id: "[test]-partner-branch", taxId: "0-1000-00000-00-1", branchTag: "00002", address: "[test] ที่อยู่สาขา 00002", branches: [] },
    { id: "[test]-other", taxId: "0100000000002", branchTag: "00003", address: "[test] ที่อยู่อื่น", branches: [] },
  ];
  const grouped = partnerBranchChoices(legacyPartners, "[test]-partner-head");
  assert.deepEqual(grouped.map((branch) => branch.branchTag), ["สำนักงานใหญ่", "00002"]);
  const groupedChanged = resolvePartnerBranchChoice(legacyPartners, "[test]-partner-head", "partner:[test]-partner-branch");
  assert.equal(groupedChanged.address, "[test] ที่อยู่สาขา 00002");

  console.log("PASS: Dropdown รวมคู่ค้าเลขผู้เสียภาษีเดียวกัน และที่อยู่เปลี่ยนตามสาขา");
} finally {
  branches.splice(0, branches.length);
}
