import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

const stamp = Date.now();
const date = new Date("2091-01-15T00:00:00.000Z");
const accountIds: string[] = [];
let partnerId: string | null = null;
let documentId: string | null = null;
let entryId: string | null = null;
let certificateId: string | null = null;
const ruleIds: string[] = [];

async function main() {
  const [{ prisma }, { createEntry, postEntry }, { buildInputVatReport }] = await Promise.all([
    import("@lamunn/db-finance"),
    import("../src/lib/accounting/post"),
    import("../src/lib/accounting/taxReports"),
  ]);
  try {
    const [expense, inputVat, bank, wht] = await Promise.all([
      prisma.accAccount.create({ data: { code: `TST-AUTO-E-${stamp}`, nameTh: "[test] ค่าใช้จ่าย AI Autokey", type: "EXPENSE" } }),
      prisma.accAccount.create({ data: { code: `TST-AUTO-V-${stamp}`, nameTh: "[test] ภาษีซื้อ AI Autokey", type: "ASSET", vatRole: "INPUT" } }),
      prisma.accAccount.create({ data: { code: `TST-AUTO-B-${stamp}`, nameTh: "[test] ธนาคาร AI Autokey", type: "ASSET" } }),
      prisma.accAccount.create({ data: { code: `TST-AUTO-W-${stamp}`, nameTh: "[test] ภาษีหัก ณ ที่จ่าย", type: "LIABILITY", vatRole: "WHT" } }),
    ]);
    accountIds.push(expense.id, inputVat.id, bank.id, wht.id);
    const partner = await prisma.accPartner.create({ data: { name: "[test] คู่ค้า AI Autokey", type: "CREDITOR", taxId: `0${String(stamp).slice(-12).padStart(12, "0")}`, address: "[test] ที่อยู่" } });
    partnerId = partner.id;
    const document = await prisma.accAutokeyDocument.create({
      data: {
        fileName: "[test] autokey.pdf", mimeType: "application/pdf", fileSize: 4,
        fileHash: createHash("sha256").update(`[test]${stamp}`).digest("hex"), status: "REVIEW",
        reviewedData: { taxReview: { whtFormType: "PND53", whtRatePercent: 3, incomeType: "[test] ค่าบริการ" } },
        chunks: { create: { chunkIndex: 0, data: Buffer.from("test") } },
      },
    });
    documentId = document.id;
    const entry = await createEntry({
      date, journalType: "PAYMENT", status: "DRAFT", description: "[test] AI Autokey learning",
      sourceType: "AI_AUTOKEY", sourceKey: document.fileHash,
      lines: [
        { accountId: expense.id, debit: 93, partnerId, memo: "[test] ค่าบริการ" },
        { accountId: inputVat.id, debit: 7, partnerId, memo: "[test] ภาษีซื้อ", docNo: `[test]-VAT-${stamp}` },
        { accountId: bank.id, credit: 97, partnerId },
        { accountId: wht.id, credit: 3, partnerId },
      ],
    });
    entryId = entry.id;
    await prisma.accAutokeyDocument.update({ where: { id: document.id }, data: { entryId: entry.id, status: "DRAFTED" } });

    await postEntry(entry.id, "[test]");
    const [posted, rule, certificate, inputVatReport] = await Promise.all([
      prisma.accJournalEntry.findUnique({ where: { id: entry.id }, include: { lines: true } }),
      prisma.accAutokeyRule.findFirst({ where: { accountId: expense.id } }),
      prisma.accWhtCertificate.findFirst({ where: { entryId: entry.id } }),
      buildInputVatReport(new Date("2091-01-01T00:00:00.000Z"), new Date("2091-01-31T23:59:59.999Z")),
    ]);
    check(posted?.status === "POSTED" && posted.lines.every((line) => line.status === "POSTED"), "ผ่านรายการอัปเดตหัวใบและบรรทัดพร้อมกัน");
    check(rule?.timesConfirmed === 1 && rule.keyword.includes("[test]"), "เรียนรู้เฉพาะรายการที่ผ่านรายการแล้ว");
    check(certificate?.formType === "PND53" && Number(certificate.whtAmount) === 3, "สร้างหนังสือรับรองและเชื่อม ภ.ง.ด.53 จากข้อมูลที่คนยืนยัน");
    check(inputVatReport.rows.some((row) => row.entryNo === posted?.entryNo && row.invoiceNo === `[test]-VAT-${stamp}` && row.vat === 700), "ภาษีซื้อจากบรรทัดใบสำคัญเข้าสู่รายงานด้วยเลขที่ใบกำกับจาก docNo");
    if (rule) ruleIds.push(rule.id);
    if (certificate) certificateId = certificate.id;
  } finally {
    if (certificateId) await prisma.accWhtCertificate.delete({ where: { id: certificateId } }).catch(() => undefined);
    for (const id of ruleIds) await prisma.accAutokeyRule.delete({ where: { id } }).catch(() => undefined);
    if (documentId) await prisma.accAutokeyDocument.delete({ where: { id: documentId } }).catch(() => undefined);
    if (entryId) await prisma.accJournalEntry.delete({ where: { id: entryId } }).catch(() => undefined);
    if (partnerId) await prisma.accPartner.delete({ where: { id: partnerId } }).catch(() => undefined);
    for (const id of accountIds) await prisma.accAccount.delete({ where: { id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
