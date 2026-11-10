/** พิสูจน์การแก้รายละเอียดหนังสือรับรองทั้ง ภ.ง.ด.3/53 และล้างสาขาเดิม โดยลบเฉพาะ id ที่สคริปต์สร้าง */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@lamunn/db-finance";
import { updateWhtCertificateDetails } from "../src/lib/accounting/whtCertificateEdit";

const createdIds: string[] = [];

async function main() {
  try {
    const outputFiles = [
      "src/components/accounting/WhtReportView.tsx",
      "src/app/print/wht-report/page.tsx",
      "src/app/print/wht/[id]/page.tsx",
      "src/lib/accounting/whtExcel.ts",
    ];
    for (const file of outputFiles) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      assert.ok(!source.includes("formatPartnerDisplayName"), `${file} ต้องไม่เติมสำนักงานใหญ่/สาขาในชื่อผู้ถูกหัก`);
    }

    for (const formType of ["PND3", "PND53"] as const) {
      const certificate = await prisma.accWhtCertificate.create({ data: {
        docNo: `[test]-WHT-EDIT-${formType}-${Date.now()}-${Math.random()}`,
        payDate: new Date("2092-04-15T00:00:00.000Z"), formType,
        payeeName: `[test] ชื่อเดิม ${formType}`, payeeTaxId: "0105568147638",
        payeeAddress: "[test] ที่อยู่เดิม", payeeBranchTag: "สำนักงานใหญ่",
        incomeType: "[test] ประเภทเดิม", baseAmount: 1000, whtRate: 0.03, whtAmount: 30,
      } });
      createdIds.push(certificate.id);
      const updated = await updateWhtCertificateDetails(certificate.id, {
        payeeName: `[test] ชื่อแก้ไข ${formType}`, payeeTaxId: "0105568147638",
        payeeAddress: "[test] ที่อยู่แก้ไข", incomeType: "ค่าบริการอื่น ๆ ม.40(8)", note: "[test] หมายเหตุแก้ไข",
      });
      assert.equal(updated.payeeName, `[test] ชื่อแก้ไข ${formType}`);
      assert.equal(updated.payeeBranchTag, null, `${formType} ต้องล้างสำนักงานใหญ่/สาขาเดิม`);
      assert.equal(updated.note, "[test] หมายเหตุแก้ไข");
      assert.equal(Number(updated.baseAmount), 1000, "การแก้รายละเอียดต้องไม่เปลี่ยนยอดบัญชี");
      assert.equal(updated.payDate.toISOString(), "2092-04-15T00:00:00.000Z", "การแก้รายละเอียดต้องไม่เปลี่ยนวันที่");
    }
    console.log("✅ verify-wht-certificate-edit ผ่านทั้งหมด");
  } finally {
    for (const id of createdIds) await prisma.accWhtCertificate.delete({ where: { id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
