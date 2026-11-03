export interface PartnerBranchOption {
  id: string;
  branchTag: string;
  address: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface PartnerWithBranches {
  id?: string;
  branchTag: string | null;
  address: string | null;
  branches: PartnerBranchOption[];
}

export interface PartnerBranchSource extends PartnerWithBranches {
  id: string;
  taxId: string | null;
}

export function activePartnerBranches(partner: PartnerWithBranches | undefined) {
  if (!partner) return [];
  const branches = partner.branches.filter((branch) => branch.isActive);
  if (branches.length > 0) return branches;

  // คู่ค้าเก่าบางรายยังไม่มีตารางสาขาแยก ต้องสร้างตัวเลือกสำนักงานใหญ่ชั่วคราว
  // เพื่อไม่ให้ฟอร์มย้อนกลับไปเป็นช่องพิมพ์ที่เปลี่ยนที่อยู่ตามสาขาไม่ได้
  return [{
    id: `legacy:${partner.id ?? "selected-partner"}`,
    branchTag: partner.branchTag?.trim() || "สำนักงานใหญ่",
    address: partner.address ?? "",
    isDefault: true,
    isActive: true,
  }];
}

export function resolvePartnerBranch(partner: PartnerWithBranches | undefined, branchId?: string) {
  const branches = activePartnerBranches(partner);
  // เก็บ id ของสาขาเป็นตัวจริง เพราะชื่อสาขาหรือที่อยู่อาจซ้ำและถูกแก้ภายหลังได้
  const branch = branches.find((item) => item.id === branchId)
    ?? branches.find((item) => item.isDefault)
    ?? branches[0];

  return {
    partnerBranchId: branch?.id ?? "",
    branchTag: branch?.branchTag ?? partner?.branchTag ?? "",
    address: branch?.address ?? partner?.address ?? "",
  };
}

function normalizedTaxId(taxId: string | null) {
  return taxId?.replace(/\D/g, "") ?? "";
}

function isHeadOffice(branchTag: string) {
  const value = branchTag.trim().toLowerCase();
  return value.includes("สำนักงานใหญ่") || value.includes("head office") || value === "00000";
}

export function partnerBranchChoices(partners: PartnerBranchSource[], partnerId: string) {
  const selected = partners.find((partner) => partner.id === partnerId);
  if (!selected) return [];

  const choices: PartnerBranchOption[] = selected.branches.filter((branch) => branch.isActive);
  const taxId = normalizedTaxId(selected.taxId);
  const legacyPartners = taxId
    ? partners.filter((partner) => normalizedTaxId(partner.taxId) === taxId)
    : [selected];

  for (const partner of legacyPartners) {
    const branchTag = partner.branchTag?.trim() || "สำนักงานใหญ่";
    choices.push({
      id: `partner:${partner.id}`,
      branchTag,
      address: partner.address ?? "",
      isDefault: isHeadOffice(branchTag),
      isActive: true,
    });
  }

  // ข้อมูลเก่ากับตารางสาขาใหม่อาจซ้ำกัน จึงรวมตามชื่อสาขาและที่อยู่ก่อนแสดงผู้ใช้
  const unique = Array.from(new Map(
    choices.map((branch) => [`${branch.branchTag.trim().toLowerCase()}\u0000${branch.address.trim().toLowerCase()}`, branch]),
  ).values());
  if (unique.length > 0 && !unique.some((branch) => branch.isDefault)) unique[0].isDefault = true;
  return unique.sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.branchTag.localeCompare(right.branchTag, "th"));
}

export function resolvePartnerBranchChoice(partners: PartnerBranchSource[], partnerId: string, branchId?: string) {
  const partner = partners.find((item) => item.id === partnerId);
  const branches = partnerBranchChoices(partners, partnerId);
  const branch = branches.find((item) => item.id === branchId)
    ?? branches.find((item) => item.isDefault)
    ?? branches[0];

  return {
    partnerBranchId: branch?.id ?? "",
    branchTag: branch?.branchTag ?? partner?.branchTag ?? "",
    address: branch?.address ?? partner?.address ?? "",
  };
}
