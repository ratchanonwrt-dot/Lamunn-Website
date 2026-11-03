export interface PartnerBranchOption {
  id: string;
  branchTag: string;
  address: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface PartnerWithBranches {
  branchTag: string | null;
  address: string | null;
  branches: PartnerBranchOption[];
}

export function activePartnerBranches(partner: PartnerWithBranches | undefined) {
  return partner?.branches.filter((branch) => branch.isActive) ?? [];
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
