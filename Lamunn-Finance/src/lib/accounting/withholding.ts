import { prisma } from "@lamunn/db-finance";

type WhtDocNoClient = Pick<typeof prisma, "accWhtCertificate">;
type WhtPayeeAddressClient = Pick<typeof prisma, "accPartner" | "accWhtCertificate">;

export async function resolveWhtPayeeAddress(certificate: {
  id: string;
  payeeName: string;
  payeeTaxId: string | null;
  payeeAddress: string | null;
  partner?: { address: string | null } | null;
}, db: WhtPayeeAddressClient = prisma): Promise<string> {
  const savedAddress = certificate.payeeAddress?.trim() || certificate.partner?.address?.trim();
  if (savedAddress) return savedAddress;

  const taxId = certificate.payeeTaxId?.replace(/\D/g, "") ?? "";
  const taxIds = [...new Set([certificate.payeeTaxId?.trim(), taxId].filter((value): value is string => Boolean(value)))];
  const identity = taxIds.length
    ? { taxId: { in: taxIds } }
    : { name: certificate.payeeName.trim() };

  const [matchingPartner, matchingCertificate] = await Promise.all([
    db.accPartner.findFirst({
      where: { ...identity, address: { not: null } },
      orderBy: { updatedAt: "desc" },
      select: { address: true },
    }),
    db.accWhtCertificate.findFirst({
      where: {
        id: { not: certificate.id },
        ...(taxIds.length ? { payeeTaxId: { in: taxIds } } : { payeeName: certificate.payeeName.trim() }),
        payeeAddress: { not: null },
      },
      orderBy: { updatedAt: "desc" },
      select: { payeeAddress: true },
    }),
  ]);

  // เอกสารเก่าหลายใบไม่มี partnerId จึงต้องเทียบตัวตนจากเลขผู้เสียภาษี และใช้เอกสารใบอื่นเป็นทางสำรองสุดท้าย
  return matchingPartner?.address?.trim() || matchingCertificate?.payeeAddress?.trim() || "-";
}

/** เลขที่หนังสือรับรองรันต่อเนื่องต่อเดือน เช่น WHT-6909-0004 */
export async function nextWhtDocNo(payDate: Date, db: WhtDocNoClient = prisma): Promise<string> {
  const be = (payDate.getUTCFullYear() + 543) % 100;
  const mm = String(payDate.getUTCMonth() + 1).padStart(2, "0");
  const head = `WHT-${String(be).padStart(2, "0")}${mm}-`;
  const last = await db.accWhtCertificate.findFirst({
    where: { docNo: { startsWith: head } },
    orderBy: { docNo: "desc" },
    select: { docNo: true },
  });
  const seq = last ? Number(last.docNo.slice(head.length)) + 1 : 1;
  return `${head}${String(seq).padStart(4, "0")}`;
}
