/** พิสูจน์ว่าประเภทคู่ค้าผูกบัญชีลูกหนี้/เจ้าหนี้ถูกต้อง และลบเฉพาะคู่ค้าที่สคริปต์สร้าง
 *
 * รัน: npx tsx scripts/verify-partner-accounts.ts
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
  const [{ prisma }, partnerAccounts] = await Promise.all([
    import("@lamunn/db-finance"),
    import("../src/lib/accounting/partnerAccounts"),
  ]);
  const suffix = randomUUID().slice(0, 8);
  const partnerIds: string[] = [];

  try {
    const accounts = await prisma.accAccount.findMany({
      where: { code: { in: ["2110", "11310"] } },
      select: { id: true, code: true, nameTh: true },
    });

    const creditor = await prisma.accPartner.create({
      data: { name: `[test] เจ้าหนี้ผูกบัญชี ${suffix}`, type: "CREDITOR", createdAt: new Date(Date.UTC(2099, 0, 1)) },
    });
    partnerIds.push(creditor.id);
    const debtor = await prisma.accPartner.create({
      data: { name: `[test] ลูกหนี้ผูกบัญชี ${suffix}`, type: "DEBTOR", createdAt: new Date(Date.UTC(2099, 0, 2)) },
    });
    partnerIds.push(debtor.id);

    check("เจ้าหนี้ผูกบัญชี 2110", partnerAccounts.partnerAccountForType(creditor.type), { code: "2110", nameTh: "เจ้าหนี้การค้า" });
    check("ลูกหนี้ผูกบัญชี 11310", partnerAccounts.partnerAccountForType(debtor.type), { code: "11310", nameTh: "ลูกหนี้การค้า" });
    check("ค้นหา id บัญชีเจ้าหนี้จากผังบัญชี", Boolean(partnerAccounts.resolvePartnerAccountId(creditor.type, accounts)), true);
    check("ค้นหา id บัญชีลูกหนี้จากผังบัญชี", Boolean(partnerAccounts.resolvePartnerAccountId(debtor.type, accounts)), true);
  } finally {
    console.log("ลบข้อมูลทดสอบด้วย id ที่สร้างในรอบนี้...");
    for (const id of partnerIds.reverse()) await prisma.accPartner.delete({ where: { id } }).catch(() => undefined);
    await prisma.$disconnect();
  }

  if (failures) throw new Error(`ไม่ผ่าน ${failures} ข้อ`);
  console.log("✅ verify-partner-accounts ผ่านทั้งหมด");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
