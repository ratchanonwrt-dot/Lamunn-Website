import { prisma } from "@lamunn/db-finance";
import { AccountingError, voidEntry } from "./post";

/** ยกเลิกใบกำกับภาษีซื้อพร้อมเอกสารบัญชีที่ยังมีอยู่จริง
 *
 * ข้อมูลเก่าบางใบเก็บ entryId ของใบสำคัญที่ถูกลบไปแล้ว การไม่กรองก่อนเรียก voidEntry
 * จะทำให้ยกเลิกเอกสารภาษีไม่ได้ทั้งที่ไม่มีรายการบัญชีเหลือให้ยกเลิกแล้ว */
export async function voidPurchaseTaxInvoice(invoiceId: string, userId?: string | null) {
  const existing = await prisma.accPurchaseTaxInvoice.findUnique({
    where: { id: invoiceId },
    include: { whtCertificate: { select: { entryId: true } } },
  });
  if (!existing) throw new AccountingError("ไม่พบใบกำกับภาษีซื้อนี้");

  const sourcedPaymentEntry = existing.entryId
    ? await prisma.accJournalEntry.findUnique({
        where: { sourceType_sourceKey: { sourceType: "PURCHASE_TAX_PAYMENT", sourceKey: existing.entryId } },
        select: { id: true },
      })
    : null;
  const candidateIds = Array.from(new Set([
    existing.entryId,
    sourcedPaymentEntry?.id,
    existing.whtCertificate?.entryId,
  ].filter((id): id is string => Boolean(id))));
  const foundEntries = candidateIds.length
    ? await prisma.accJournalEntry.findMany({ where: { id: { in: candidateIds } }, select: { id: true } })
    : [];
  const foundIds = new Set(foundEntries.map((entry) => entry.id));

  // รักษาลำดับเดิมไว้เพื่อให้ใบซื้อถูกยกเลิกก่อนใบจ่าย และข้ามเฉพาะลิงก์เก่าที่ไม่เหลือเอกสารจริง
  for (const entryId of candidateIds) {
    if (foundIds.has(entryId)) await voidEntry(entryId, userId);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.accPurchaseTaxInvoice.update({ where: { id: invoiceId }, data: { voided: true } });
    await tx.accWhtCertificate.updateMany({ where: { purchaseInvoiceId: invoiceId }, data: { voided: true } });
    return updated;
  });
}
