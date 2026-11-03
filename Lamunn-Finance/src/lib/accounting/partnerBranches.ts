import { prisma } from "@lamunn/db-finance";

function requiredText(value: unknown, label: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`กรุณากรอก${label}`);
  return text;
}

export async function createPartnerBranch(input: { partnerId: string; branchTag: unknown; address: unknown; isDefault?: boolean }) {
  const branchTag = requiredText(input.branchTag, "สาขา/สำนักงานใหญ่");
  const address = requiredText(input.address, "ที่อยู่สาขา");

  return prisma.$transaction(async (tx) => {
    const partner = await tx.accPartner.findUnique({ where: { id: input.partnerId }, select: { id: true } });
    if (!partner) throw new Error("ไม่พบคู่ค้า");
    const branchCount = await tx.accPartnerBranch.count({ where: { partnerId: input.partnerId } });
    const isDefault = input.isDefault === true || branchCount === 0;
    if (isDefault) {
      await tx.accPartnerBranch.updateMany({ where: { partnerId: input.partnerId }, data: { isDefault: false } });
    }
    const branch = await tx.accPartnerBranch.create({
      data: { partnerId: input.partnerId, branchTag, address, isDefault },
    });
    if (isDefault) {
      // เก็บสำเนาสาขาหลักในคู่ค้าด้วย เพื่อหน้ารุ่นเก่าและ AI Autokey ยังได้ที่อยู่ที่ถูกต้อง
      await tx.accPartner.update({ where: { id: input.partnerId }, data: { branchTag, address } });
    }
    return branch;
  });
}

export async function updatePartnerBranch(
  partnerId: string,
  branchId: string,
  input: { branchTag?: unknown; address?: unknown; isDefault?: boolean; isActive?: boolean },
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.accPartnerBranch.findFirst({ where: { id: branchId, partnerId } });
    if (!current) throw new Error("ไม่พบสาขาคู่ค้า");
    const branchTag = input.branchTag === undefined ? current.branchTag : requiredText(input.branchTag, "สาขา/สำนักงานใหญ่");
    const address = input.address === undefined ? current.address : requiredText(input.address, "ที่อยู่สาขา");
    const makeDefault = input.isDefault === true;
    if (makeDefault) {
      await tx.accPartnerBranch.updateMany({ where: { partnerId }, data: { isDefault: false } });
    }
    const branch = await tx.accPartnerBranch.update({
      where: { id: branchId },
      data: {
        branchTag,
        address,
        isDefault: makeDefault || current.isDefault,
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      },
    });
    if (branch.isDefault) {
      await tx.accPartner.update({ where: { id: partnerId }, data: { branchTag: branch.branchTag, address: branch.address } });
    }
    return branch;
  });
}

export async function deletePartnerBranch(partnerId: string, branchId: string) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.accPartnerBranch.findFirst({ where: { id: branchId, partnerId } });
    if (!current) throw new Error("ไม่พบสาขาคู่ค้า");
    await tx.accPartnerBranch.delete({ where: { id: branchId } });

    if (current.isDefault) {
      const replacement = await tx.accPartnerBranch.findFirst({
        where: { partnerId, isActive: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      if (replacement) {
        await tx.accPartnerBranch.update({ where: { id: replacement.id }, data: { isDefault: true } });
        await tx.accPartner.update({
          where: { id: partnerId },
          data: { branchTag: replacement.branchTag, address: replacement.address },
        });
      } else {
        await tx.accPartner.update({ where: { id: partnerId }, data: { branchTag: null, address: null } });
      }
      return { ok: true, defaultBranchId: replacement?.id ?? null };
    }
    return { ok: true, defaultBranchId: null };
  });
}
