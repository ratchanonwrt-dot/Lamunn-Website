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
