import { prisma } from "@lamunn/db-finance";
import { AccountingError } from "./post";

export interface WhtCertificateDetailsPatch {
  payeeName?: unknown;
  payeeTaxId?: unknown;
  payeeAddress?: unknown;
  payeeBranchTag?: unknown;
  incomeType?: unknown;
  note?: unknown;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

/** แก้เฉพาะข้อมูลบนหนังสือรับรอง ยอดและวันที่ต้องแก้จากเอกสารต้นทางเพื่อไม่ให้งบกับรายงานต่างกัน */
export async function updateWhtCertificateDetails(id: string, patch: WhtCertificateDetailsPatch) {
  const current = await prisma.accWhtCertificate.findUnique({ where: { id }, select: { id: true, formType: true, voided: true } });
  if (!current) throw new AccountingError("ไม่พบหนังสือรับรองนี้");
  if (current.voided) throw new AccountingError("หนังสือรับรองนี้ถูกยกเลิกแล้ว แก้ไขไม่ได้");

  const payeeName = text(patch.payeeName);
  const payeeTaxId = text(patch.payeeTaxId).replace(/\D/g, "");
  const payeeAddress = text(patch.payeeAddress);
  const payeeBranchTag = text(patch.payeeBranchTag);
  const incomeType = text(patch.incomeType);
  const note = text(patch.note);
  if (!payeeName || !incomeType) throw new AccountingError("กรอกชื่อผู้ถูกหักภาษีและประเภทเงินได้ให้ครบ");
  if (payeeTaxId && payeeTaxId.length !== 13) throw new AccountingError("เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก");
  if (current.formType === "PND3" && !payeeAddress) throw new AccountingError("ภ.ง.ด.3 ต้องกรอกที่อยู่ผู้ถูกหักภาษี");
  if (current.formType === "PND53" && !payeeBranchTag) throw new AccountingError("ภ.ง.ด.53 ต้องกรอกสำนักงานใหญ่/สาขา");

  return prisma.accWhtCertificate.update({
    where: { id },
    data: {
      payeeName,
      payeeTaxId: payeeTaxId || null,
      payeeAddress: payeeAddress || null,
      // ภ.ง.ด.3 เป็นบุคคลธรรมดาจึงไม่เก็บป้ายสาขา แต่ ภ.ง.ด.53 ต้องรักษาสาขาของนิติบุคคลไว้
      payeeBranchTag: current.formType === "PND3" ? null : payeeBranchTag,
      incomeType,
      note: note || null,
    },
  });
}
