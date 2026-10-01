/** พิสูจน์ว่าหนังสือรับรอง ภ.ง.ด.3 แสดงที่อยู่ snapshot และรองรับเอกสารเก่าที่ต้องใช้ที่อยู่จากคู่ค้า
 *
 * ข้อมูลอยู่ปี ค.ศ. 2099 ชื่อขึ้นต้น [test] และ finally ลบด้วย id ที่สคริปต์สร้างเท่านั้น
 * รัน: npx tsx scripts/verify-pnd3-payee-address.ts
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@lamunn/db-finance";
import { resolveWhtPayeeAddress } from "../src/lib/accounting/withholding";

const date = new Date(Date.UTC(2099, 5, 15));
const suffix = randomUUID().slice(0, 8);
let fails = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "ผ่าน" : "ไม่ผ่าน ❌"}  ${label}${ok ? "" : ` (ได้ ${JSON.stringify(actual)} ควรเป็น ${JSON.stringify(expected)})`}`);
  if (!ok) fails++;
}

async function main() {
  let partnerId: string | null = null;
  const certificateIds: string[] = [];

  try {
    const partner = await prisma.accPartner.create({
      data: {
        name: `[test] ผู้รับเงิน ภ.ง.ด.3 ${suffix}`,
        type: "CREDITOR",
        taxId: "1234567890123",
        address: "[test] 99 ถนนทดสอบ แขวงทดสอบ เขตทดสอบ กรุงเทพมหานคร 10999",
      },
    });
    partnerId = partner.id;

    const legacyCertificate = await prisma.accWhtCertificate.create({
      data: {
        docNo: `[test]-PND3-LEGACY-${suffix}`,
        payDate: date,
        formType: "PND3",
        partnerId: partner.id,
        payeeName: partner.name,
        payeeTaxId: partner.taxId,
        payeeAddress: null,
        incomeType: "ค่าบริการ ม.40(2)",
        baseAmount: 1000,
        whtRate: 0.03,
        whtAmount: 30,
      },
      include: { partner: { select: { address: true } } },
    });
    certificateIds.push(legacyCertificate.id);
    check("เอกสารเก่า ภ.ง.ด.3 ใช้ที่อยู่จากคู่ค้า", await resolveWhtPayeeAddress(legacyCertificate), partner.address);

    const snapshotCertificate = await prisma.accWhtCertificate.create({
      data: {
        docNo: `[test]-PND3-SNAPSHOT-${suffix}`,
        payDate: date,
        formType: "PND3",
        partnerId: partner.id,
        payeeName: partner.name,
        payeeTaxId: partner.taxId,
        payeeAddress: "[test] ที่อยู่ตอนออกหนังสือรับรอง",
        incomeType: "ค่าบริการ ม.40(2)",
        baseAmount: 2000,
        whtRate: 0.03,
        whtAmount: 60,
      },
      include: { partner: { select: { address: true } } },
    });
    certificateIds.push(snapshotCertificate.id);
    check("เอกสารใหม่ใช้ที่อยู่ snapshot ก่อนข้อมูลคู่ค้า", await resolveWhtPayeeAddress(snapshotCertificate), "[test] ที่อยู่ตอนออกหนังสือรับรอง");

    const unlinkedLegacyCertificate = await prisma.accWhtCertificate.create({
      data: {
        docNo: `[test]-PND3-UNLINKED-${suffix}`,
        payDate: date,
        formType: "PND3",
        payeeName: partner.name,
        payeeTaxId: partner.taxId,
        payeeAddress: null,
        incomeType: "ค่าบริการ ม.40(2)",
        baseAmount: 3000,
        whtRate: 0.03,
        whtAmount: 90,
      },
      include: { partner: { select: { address: true } } },
    });
    certificateIds.push(unlinkedLegacyCertificate.id);
    check(
      "เอกสารเก่าที่ไม่ผูกคู่ค้าเทียบที่อยู่ด้วยเลขผู้เสียภาษี",
      await resolveWhtPayeeAddress(unlinkedLegacyCertificate),
      partner.address,
    );
  } finally {
    console.log("ลบข้อมูลทดสอบด้วย id ที่สร้างในรอบนี้...");
    for (const id of certificateIds.reverse()) {
      await prisma.accWhtCertificate.delete({ where: { id } }).catch(() => undefined);
    }
    if (partnerId) await prisma.accPartner.delete({ where: { id: partnerId } }).catch(() => undefined);
  }

  if (fails) throw new Error(`ไม่ผ่าน ${fails} ข้อ`);
  console.log("✅ verify-pnd3-payee-address ผ่านทั้งหมด");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
