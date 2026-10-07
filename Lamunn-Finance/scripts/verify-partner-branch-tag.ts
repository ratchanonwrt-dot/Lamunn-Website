/** พิสูจน์ว่าคู่ค้าเก็บและแก้ไขข้อมูลสำนักงานใหญ่/สาขาได้ โดยไม่แตะรายการบัญชี
 *
 * ข้อมูลทดสอบใช้ปี ค.ศ. 2099 ในชื่อ และ finally ลบเฉพาะ id ที่สคริปต์สร้าง
 * รัน: npx tsx scripts/verify-partner-branch-tag.ts
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@lamunn/db-finance";

const suffix = randomUUID().slice(0, 8);
let partnerId: string | null = null;

function check(label: string, actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`${label}: ได้ ${JSON.stringify(actual)} ควรเป็น ${JSON.stringify(expected)}`);
  console.log(`ผ่าน  ${label}`);
}

async function main() {
  try {
    const partner = await prisma.accPartner.create({
      data: {
        name: `[test] คู่ค้าสาขา 2099 ${suffix}`,
        type: "CREDITOR",
        taxId: "1234567890123",
        branchTag: "สำนักงานใหญ่",
      },
    });
    partnerId = partner.id;
    check("บันทึกสำนักงานใหญ่", partner.branchTag, "สำนักงานใหญ่");

    const updated = await prisma.accPartner.update({
      where: { id: partner.id },
      data: { branchTag: "00001" },
      select: { branchTag: true },
    });
    check("แก้ไขเป็นรหัสสาขา", updated.branchTag, "00001");
  } finally {
    if (partnerId) await prisma.accPartner.delete({ where: { id: partnerId } }).catch(() => undefined);
  }

  console.log("✅ verify-partner-branch-tag ผ่านทั้งหมด");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
