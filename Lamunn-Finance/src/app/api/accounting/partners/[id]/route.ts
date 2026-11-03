import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { revalidateAccountingRef, ACC_PARTNERS_TAG } from "@/lib/accounting/refData";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireSectionApi("ACCOUNTING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, type, phone, taxId, branchTag, address, note, isActive } = body;

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = String(name).trim();
  if (type !== undefined) {
    if (!["DEBTOR", "CREDITOR"].includes(type)) return NextResponse.json({ error: "ประเภทไม่ถูกต้อง" }, { status: 400 });
    data.type = type;
  }
  if (phone !== undefined) data.phone = phone || null;
  if (taxId !== undefined) data.taxId = taxId || null;
  if (branchTag !== undefined) data.branchTag = String(branchTag).trim() || null;
  if (address !== undefined) data.address = address || null;
  if (note !== undefined) data.note = note || null;
  if (isActive !== undefined) data.isActive = !!isActive;

  const partner = await prisma.$transaction(async (tx) => {
    let updated = await tx.accPartner.update({ where: { id: params.id }, data });
    if (branchTag !== undefined || address !== undefined) {
      const defaultBranch = await tx.accPartnerBranch.findFirst({ where: { partnerId: params.id, isDefault: true } });
      const nextTag = String(updated.branchTag ?? "").trim() || "สำนักงานใหญ่";
      const nextAddress = String(updated.address ?? "").trim();
      if (nextAddress) {
        if (defaultBranch) {
          await tx.accPartnerBranch.update({ where: { id: defaultBranch.id }, data: { branchTag: nextTag, address: nextAddress } });
        } else {
          await tx.accPartnerBranch.create({ data: { partnerId: params.id, branchTag: nextTag, address: nextAddress, isDefault: true } });
        }
      } else if (defaultBranch) {
        // สาขาที่ผูกเอกสารภาษีแล้วต้องไม่เสียที่อยู่เพราะล้างช่องในฟอร์มคู่ค้าโดยไม่ตั้งใจ
        updated = await tx.accPartner.update({
          where: { id: params.id },
          data: { branchTag: defaultBranch.branchTag, address: defaultBranch.address },
        });
      }
    }
    return updated;
  });
  revalidateAccountingRef(ACC_PARTNERS_TAG);
  return NextResponse.json({ partner });
}

/** ลบได้เฉพาะคู่ค้าที่ยังไม่เคยถูกอ้างอิงในบรรทัดใบสำคัญ — ถ้าเคยใช้แล้วให้ปิดใช้งาน (isActive) แทน */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireSectionApi("ACCOUNTING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const used = await prisma.accJournalLine.count({ where: { partnerId: params.id } });
  if (used > 0) {
    return NextResponse.json({ error: "คู่ค้านี้ถูกใช้ในใบสำคัญแล้ว ลบไม่ได้ — ปิดใช้งานแทนได้" }, { status: 400 });
  }
  await prisma.accPartner.delete({ where: { id: params.id } });
  revalidateAccountingRef(ACC_PARTNERS_TAG);
  return NextResponse.json({ ok: true });
}
