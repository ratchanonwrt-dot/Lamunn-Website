/** พิสูจน์ว่าคู่ค้าหนึ่งรายมีหลายสาขา เปลี่ยนสาขาหลักแล้วที่อยู่เปลี่ยนตาม และลบเฉพาะ id ที่สร้าง
 *
 * รัน: npx tsx scripts/verify-partner-branches.ts
 */
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "ผ่าน" : "ไม่ผ่าน ❌"}  ${label}${ok ? "" : ` (ได้ ${JSON.stringify(actual)} ควรเป็น ${JSON.stringify(expected)})`}`);
  if (!ok) failures++;
}

async function main() {
  const [{ prisma }, branches] = await Promise.all([
    import("@lamunn/db-finance"),
    import("../src/lib/accounting/partnerBranches"),
  ]);
  const suffix = randomUUID().slice(0, 8);
  let partnerId: string | null = null;
  const branchIds: string[] = [];

  try {
    const partner = await prisma.accPartner.create({
      data: {
        name: `[test] คู่ค้าหลายสาขา ${suffix}`,
        type: "CREDITOR",
        taxId: "0105555555555",
        createdAt: new Date(Date.UTC(2099, 0, 1)),
      },
    });
    partnerId = partner.id;

    const headOffice = await branches.createPartnerBranch({
      partnerId,
      branchTag: "สำนักงานใหญ่",
      address: "[test] ที่อยู่สำนักงานใหญ่",
    });
    branchIds.push(headOffice.id);
    const branchOne = await branches.createPartnerBranch({
      partnerId,
      branchTag: "00001",
      address: "[test] ที่อยู่สาขา 00001",
    });
    branchIds.push(branchOne.id);

    check("สาขาแรกเป็นสาขาหลัก", headOffice.isDefault, true);
    check("สาขาที่สองไม่แย่งค่าเริ่มต้น", branchOne.isDefault, false);

    await branches.updatePartnerBranch(partnerId, branchOne.id, { isDefault: true });
    const [afterSwitch, partnerAfterSwitch] = await Promise.all([
      prisma.accPartnerBranch.findMany({ where: { partnerId }, orderBy: { branchTag: "asc" } }),
      prisma.accPartner.findUniqueOrThrow({ where: { id: partnerId } }),
    ]);
    check("เปลี่ยนสาขาหลักได้เพียงหนึ่งสาขา", afterSwitch.filter((item) => item.isDefault).map((item) => item.branchTag), ["00001"]);
    check("ที่อยู่คู่ค้าเปลี่ยนตามสาขาหลัก", [partnerAfterSwitch.branchTag, partnerAfterSwitch.address], ["00001", "[test] ที่อยู่สาขา 00001"]);

    await branches.deletePartnerBranch(partnerId, branchOne.id);
    const [remaining, partnerAfterDelete] = await Promise.all([
      prisma.accPartnerBranch.findUniqueOrThrow({ where: { id: headOffice.id } }),
      prisma.accPartner.findUniqueOrThrow({ where: { id: partnerId } }),
    ]);
    check("ลบสาขาหลักแล้วตั้งสาขาที่เหลือเป็นหลัก", remaining.isDefault, true);
    check("ที่อยู่กลับตามสาขาที่เหลือ", [partnerAfterDelete.branchTag, partnerAfterDelete.address], ["สำนักงานใหญ่", "[test] ที่อยู่สำนักงานใหญ่"]);
  } finally {
    console.log("ลบข้อมูลทดสอบด้วย id ที่สร้างในรอบนี้...");
    for (const id of branchIds.reverse()) await prisma.accPartnerBranch.delete({ where: { id } }).catch(() => undefined);
    if (partnerId) await prisma.accPartner.delete({ where: { id: partnerId } }).catch(() => undefined);
    await prisma.$disconnect();
  }

  if (failures) throw new Error(`ไม่ผ่าน ${failures} ข้อ`);
  console.log("✅ verify-partner-branches ผ่านทั้งหมด");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
