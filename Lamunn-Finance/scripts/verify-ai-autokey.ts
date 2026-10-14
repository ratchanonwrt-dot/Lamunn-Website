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
const extraEntryIds: string[] = [];
let certificateId: string | null = null;
const ruleIds: string[] = [];

async function main() {
  const [{ prisma }, { createEntry, postEntry }, { buildInputVatReport }, { normalizeAutokeyDate, normalizeAutokeyCreditNote, autokeyResultSchema }] = await Promise.all([
    import("@lamunn/db-finance"),
    import("../src/lib/accounting/post"),
    import("../src/lib/accounting/taxReports"),
    import("../src/lib/accounting/autokey"),
  ]);
  try {
    check(normalizeAutokeyDate("2569-09-29", 2026) === "2026-09-29" && normalizeAutokeyDate("2069-09-29", 2026) === "2026-09-29", "แปลงปี พ.ศ. 2569 และปีไทยแบบสั้น 69 เป็น ค.ศ. 2026");
    const creditNoteBase = {
      date: "2091-01-15", documentType: "CREDIT_NOTE" as const, journalType: "PURCHASE" as const,
      description: "[test] ยอดในวงเล็บ", docNo: "[test]-CN-001",
      vendor: { name: "[test] ผู้ขาย", taxId: null, branchTag: null, address: null },
      isClaimableVat: true, whtFormType: null, whtRatePercent: null, incomeType: null,
      confidence: 95, warnings: [] as string[],
      lines: [
        { accountCode: "EXP", debitSatang: 10000, creditSatang: 0, memo: "[test] สินค้า", docNo: null },
        { accountCode: "INPUT", debitSatang: 700, creditSatang: 0, memo: "[test] ภาษีซื้อ", docNo: "[test]-CN-001" },
        { accountCode: "AP", debitSatang: 0, creditSatang: 10700, memo: "[test] เจ้าหนี้", docNo: null },
      ],
    };
    const accountHints = [
      { code: "EXP", type: "EXPENSE", vatRole: null },
      { code: "INPUT", type: "ASSET", vatRole: "INPUT" },
      { code: "AP", type: "LIABILITY", vatRole: null },
      { code: "REV", type: "REVENUE", vatRole: null },
      { code: "OUTPUT", type: "LIABILITY", vatRole: "OUTPUT" },
      { code: "AR", type: "ASSET", vatRole: null },
    ];
    const purchaseCreditNote = normalizeAutokeyCreditNote(autokeyResultSchema.parse(creditNoteBase), accountHints);
    check(purchaseCreditNote.lines[0].creditSatang === 10000 && purchaseCreditNote.lines[1].creditSatang === 700 && purchaseCreditNote.lines[2].debitSatang === 10700, "ยอดติดลบ/วงเล็บของใบซื้อกลับด้านเป็นลดค่าใช้จ่าย ภาษีซื้อ และเจ้าหนี้");
    check(purchaseCreditNote.description.startsWith("ใบลดหนี้:"), "คำอธิบายร่างระบุชัดว่าเป็นใบลดหนี้");

    const salesCreditNote = normalizeAutokeyCreditNote(autokeyResultSchema.parse({
      ...creditNoteBase, journalType: "SALES", description: "[test] ใบลดหนี้ขาย",
      lines: [
        { accountCode: "REV", debitSatang: 10000, creditSatang: 0, memo: "[test] ลดรายได้", docNo: null },
        { accountCode: "OUTPUT", debitSatang: 700, creditSatang: 0, memo: "[test] ลดภาษีขาย", docNo: "[test]-CN-002" },
        { accountCode: "AR", debitSatang: 0, creditSatang: 10700, memo: "[test] ลดลูกหนี้", docNo: null },
      ],
    }), accountHints);
    check(salesCreditNote.lines[0].debitSatang === 10000 && salesCreditNote.lines[1].debitSatang === 700 && salesCreditNote.lines[2].creditSatang === 10700, "ใบลดหนี้ขายที่กลับด้านถูกแล้วไม่ถูกสลับซ้ำ");

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
        chunks: { create: { chunkIndex: 0, data: Buffer.from("test") } },
      },
    });
    documentId = document.id;
    const drafts = [];
    for (let pageNumber = 1; pageNumber <= 4; pageNumber += 1) {
      drafts.push(await prisma.accAutokeyDraft.create({
        data: {
          documentId: document.id,
          pageNumber,
          extractedData: { pageNumber, description: `[test] ร่างหน้า ${pageNumber}` },
          reviewedData: pageNumber === 1 ? { taxReview: { whtFormType: "PND53", whtRatePercent: 3, incomeType: "[test] ค่าบริการ" } } : undefined,
        },
      }));
    }
    const entry = await createEntry({
      date, journalType: "PAYMENT", status: "DRAFT", description: "[test] AI Autokey learning",
      sourceType: "AI_AUTOKEY", sourceKey: `${document.fileHash}:page:1`,
      lines: [
        { accountId: expense.id, debit: 93, partnerId, memo: "[test] ค่าบริการ" },
        { accountId: inputVat.id, debit: 7, partnerId, memo: "[test] ภาษีซื้อ", docNo: `[test]-VAT-${stamp}` },
        { accountId: bank.id, credit: 97, partnerId },
        { accountId: wht.id, credit: 3, partnerId },
      ],
    });
    entryId = entry.id;
    await prisma.accAutokeyDraft.update({ where: { id: drafts[0].id }, data: { entryId: entry.id } });
    for (let pageNumber = 2; pageNumber <= 4; pageNumber += 1) {
      const extra = await createEntry({
        date, journalType: "PAYMENT", status: "DRAFT", description: `[test] AI Autokey หน้า ${pageNumber}`,
        sourceType: "AI_AUTOKEY", sourceKey: `${document.fileHash}:page:${pageNumber}`,
        lines: [
          { accountId: expense.id, debit: pageNumber, partnerId, memo: `[test] หน้า ${pageNumber}` },
          { accountId: bank.id, credit: pageNumber, partnerId },
        ],
      });
      extraEntryIds.push(extra.id);
      await prisma.accAutokeyDraft.update({ where: { id: drafts[pageNumber - 1].id }, data: { entryId: extra.id } });
    }
    await prisma.accAutokeyDocument.update({ where: { id: document.id }, data: { status: "DRAFTED" } });

    await postEntry(entry.id, "[test]");
    const [posted, rule, certificate, inputVatReport, linkedDrafts] = await Promise.all([
      prisma.accJournalEntry.findUnique({ where: { id: entry.id }, include: { lines: true } }),
      prisma.accAutokeyRule.findFirst({ where: { accountId: expense.id } }),
      prisma.accWhtCertificate.findFirst({ where: { entryId: entry.id } }),
      buildInputVatReport(new Date("2091-01-01T00:00:00.000Z"), new Date("2091-01-31T23:59:59.999Z")),
      prisma.accAutokeyDraft.findMany({ where: { documentId: document.id }, orderBy: { pageNumber: "asc" } }),
    ]);
    check(linkedDrafts.length === 4 && linkedDrafts.every((draft, index) => draft.pageNumber === index + 1 && Boolean(draft.entryId)), "PDF 4 หน้าเก็บร่างและใบสำคัญแยกครบทุกหน้า");
    check(posted?.status === "POSTED" && posted.lines.every((line) => line.status === "POSTED"), "ผ่านรายการอัปเดตหัวใบและบรรทัดพร้อมกัน");
    check(rule?.timesConfirmed === 1 && rule.keyword.includes("[test]"), "เรียนรู้เฉพาะรายการที่ผ่านรายการแล้ว");
    check(certificate?.formType === "PND53" && Number(certificate.whtAmount) === 3, "สร้างหนังสือรับรองและเชื่อม ภ.ง.ด.53 จากข้อมูลที่คนยืนยัน");
    check(inputVatReport.rows.some((row) => row.entryNo === posted?.entryNo && row.invoiceNo === `[test]-VAT-${stamp}` && row.vat === 700), "ภาษีซื้อจากบรรทัดใบสำคัญเข้าสู่รายงานด้วยเลขที่ใบกำกับจาก docNo");
    const creditNoteEntry = await createEntry({
      date, journalType: "PURCHASE", status: "DRAFT", description: "[test] ใบลดหนี้ AI Autokey",
      sourceType: "AI_AUTOKEY", sourceKey: `${document.fileHash}:credit-note`,
      lines: [
        { accountId: expense.id, credit: 93, partnerId, memo: "[test] ลดค่าใช้จ่าย" },
        { accountId: inputVat.id, credit: 7, partnerId, memo: "[test] ลดภาษีซื้อ", docNo: `[test]-CN-${stamp}` },
        { accountId: bank.id, debit: 100, partnerId, memo: "[test] เงินรับคืน" },
      ],
    });
    extraEntryIds.push(creditNoteEntry.id);
    await postEntry(creditNoteEntry.id, "[test]");
    const creditNoteReport = await buildInputVatReport(new Date("2091-01-01T00:00:00.000Z"), new Date("2091-01-31T23:59:59.999Z"));
    const creditNoteRow = creditNoteReport.rows.find((row) => row.invoiceNo === `[test]-CN-${stamp}`);
    check(creditNoteRow?.base === -9300 && creditNoteRow.vat === -700 && creditNoteRow.total === -10000, "ใบลดหนี้ AI ลดฐาน ภาษีซื้อ และยอดรวมในรายงานด้วยจำนวนติดลบ");
    if (rule) ruleIds.push(rule.id);
    if (certificate) certificateId = certificate.id;
  } finally {
    if (certificateId) await prisma.accWhtCertificate.delete({ where: { id: certificateId } }).catch(() => undefined);
    for (const id of ruleIds) await prisma.accAutokeyRule.delete({ where: { id } }).catch(() => undefined);
    if (documentId) await prisma.accAutokeyDocument.delete({ where: { id: documentId } }).catch(() => undefined);
    if (entryId) await prisma.accJournalEntry.delete({ where: { id: entryId } }).catch(() => undefined);
    for (const id of extraEntryIds) await prisma.accJournalEntry.delete({ where: { id } }).catch(() => undefined);
    if (partnerId) await prisma.accPartner.delete({ where: { id: partnerId } }).catch(() => undefined);
    for (const id of accountIds) await prisma.accAccount.delete({ where: { id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
