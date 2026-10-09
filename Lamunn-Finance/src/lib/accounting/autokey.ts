import { createHash } from "node:crypto";
import { prisma } from "@lamunn/db-finance";
import { z } from "zod";
import { toSatang } from "./money";
import { toBaht } from "./money";
import { nextWhtDocNo } from "./withholding";

export const AUTOKEY_MAX_FILE_BYTES = 50 * 1024 * 1024;
export const AUTOKEY_CHUNK_BYTES = 3 * 1024 * 1024;
export const AUTOKEY_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

const lineSchema = z.object({
  accountCode: z.string(),
  debitSatang: z.number().int().nonnegative(),
  creditSatang: z.number().int().nonnegative(),
  memo: z.string(),
  docNo: z.string().nullable(),
});

export const autokeyResultSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  journalType: z.enum(["GENERAL", "SALES", "PURCHASE", "RECEIPT", "PAYMENT", "ADJUST"]),
  description: z.string().min(1),
  docNo: z.string().nullable(),
  vendor: z.object({
    name: z.string(),
    taxId: z.string().nullable(),
    branchTag: z.string().nullable(),
    address: z.string().nullable(),
  }),
  isClaimableVat: z.boolean(),
  whtFormType: z.enum(["PND3", "PND53"]).nullable(),
  whtRatePercent: z.number().nonnegative().nullable(),
  incomeType: z.string().nullable(),
  confidence: z.number().int().min(0).max(100),
  warnings: z.array(z.string()),
  lines: z.array(lineSchema).min(2),
});

export type AutokeyResult = z.infer<typeof autokeyResultSchema>;

const responseSchema = {
  type: "object",
  required: ["date", "journalType", "description", "docNo", "vendor", "isClaimableVat", "whtFormType", "whtRatePercent", "incomeType", "confidence", "warnings", "lines"],
  properties: {
    date: { type: "string", description: "วันที่เอกสาร ค.ศ. รูปแบบ YYYY-MM-DD" },
    journalType: { type: "string", enum: ["GENERAL", "SALES", "PURCHASE", "RECEIPT", "PAYMENT", "ADJUST"] },
    description: { type: "string" },
    docNo: { type: "string", nullable: true },
    vendor: {
      type: "object",
      required: ["name", "taxId", "branchTag", "address"],
      properties: {
        name: { type: "string" },
        taxId: { type: "string", nullable: true },
        branchTag: { type: "string", nullable: true },
        address: { type: "string", nullable: true },
      },
    },
    isClaimableVat: { type: "boolean" },
    whtFormType: { type: "string", enum: ["PND3", "PND53"], nullable: true },
    whtRatePercent: { type: "number", nullable: true },
    incomeType: { type: "string", nullable: true },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    warnings: { type: "array", items: { type: "string" } },
    lines: {
      type: "array",
      minItems: 2,
      items: {
        type: "object",
        required: ["accountCode", "debitSatang", "creditSatang", "memo", "docNo"],
        properties: {
          accountCode: { type: "string" },
          debitSatang: { type: "integer", minimum: 0 },
          creditSatang: { type: "integer", minimum: 0 },
          memo: { type: "string" },
          docNo: { type: "string", nullable: true },
        },
      },
    },
  },
};

export async function analyzeAccountingDocument(file: Buffer, mimeType: string): Promise<AutokeyResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("ยังไม่ได้ตั้งค่า GEMINI_API_KEY ในระบบ");

  const [accounts, rules] = await Promise.all([
    prisma.accAccount.findMany({
      where: { isActive: true, isPostable: true },
      orderBy: { code: "asc" },
      select: { code: true, nameTh: true, type: true, vatRole: true },
    }),
    prisma.accAutokeyRule.findMany({
      where: { isActive: true },
      orderBy: [{ timesConfirmed: "desc" }, { lastConfirmedAt: "desc" }],
      take: 200,
      select: { partnerTaxId: true, keyword: true, journalType: true, timesConfirmed: true, account: { select: { code: true, nameTh: true } } },
    }),
  ]);

  const prompt = [
    "คุณเป็นผู้ช่วยนักบัญชีไทย อ่านเอกสารนี้แล้วเสนอใบสำคัญบัญชีคู่เป็นร่างเพื่อให้มนุษย์ตรวจสอบ",
    "ใช้เฉพาะรหัสบัญชีในผังที่ให้มา จำนวนเงินทุกช่องต้องเป็นสตางค์จำนวนเต็ม และผลรวมเดบิตต้องเท่ากับเครดิต",
    "เลขที่ใบกำกับภาษีต้องใส่ docNo ในบรรทัดภาษีซื้อ/ขาย ห้ามใช้เลขที่ใบสำคัญแทน",
    "ถ้ามีส่วนต่างระหว่างยอดรวมกับยอดจ่าย ให้ตรวจว่าตรงกับภาษีหัก ณ ที่จ่ายหรือไม่ แล้วเตือนเมื่อยังไม่แน่ใจ",
    "ถ้าเป็นภาษีซื้อต้องห้าม ให้รวม VAT เป็นค่าใช้จ่ายและอย่าใช้บัญชีที่ vatRole INPUT",
    "ห้ามสร้างรหัสบัญชีใหม่ ห้ามเดาข้อมูลที่อ่านไม่ชัด ให้ใส่ warnings ภาษาไทย",
    `ผังบัญชี: ${JSON.stringify(accounts)}`,
    `รูปแบบที่คนเคยยืนยันแล้ว (ใช้เป็นคำแนะนำเท่านั้น): ${JSON.stringify(rules)}`,
  ].join("\n");

  // งานอ่านเอกสารต้องจบใน serverless request เดียว รุ่น Lite ผ่านไฟล์ทดสอบในไม่กี่วินาที
  // จึงไม่ fallback ไปรุ่นใหญ่ที่คิวแน่น เพราะจะทำให้ Vercel timeout ก่อนตอบ JSON กลับผู้ใช้
  const models = Array.from(new Set([process.env.GEMINI_MODEL?.trim(), "gemini-3.1-flash-lite", "gemini-3.5-flash-lite"].filter(Boolean))) as string[];
  const requestBody = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType, data: file.toString("base64") } }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema },
  });
  let payload: any;
  let lastError = "Gemini อ่านเอกสารไม่สำเร็จ";
  for (const [index, model] of models.entries()) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
    });
    payload = await response.json();
    if (response.ok) break;
    lastError = payload?.error?.message || lastError;
    // รุ่น Flash อาจเต็มเป็นช่วงสั้น ๆ จึงสลับรุ่นเฉพาะ error ชั่วคราว ส่วน error เอกสาร/สิทธิ์ต้องแจ้งทันที
    if (![429, 503].includes(response.status) || index === models.length - 1) throw new Error(lastError);
  }
  const text = payload?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("");
  if (!text) throw new Error("Gemini ไม่ได้ส่งผลการอ่านเอกสารกลับมา");

  const result = autokeyResultSchema.parse(JSON.parse(text));
  const debit = result.lines.reduce((sum, line) => sum + line.debitSatang, 0);
  const credit = result.lines.reduce((sum, line) => sum + line.creditSatang, 0);
  if (debit !== credit || debit === 0) result.warnings.push(`เดบิตและเครดิตจาก AI ยังไม่ลงตัว ต่างกัน ${Math.abs(debit - credit)} สตางค์`);
  return result;
}

export async function recordAutokeyLearning(entryId: string) {
  const entry = await prisma.accJournalEntry.findUnique({
    where: { id: entryId },
    include: { autokeyDocument: true, lines: { include: { account: true, partner: true } } },
  });
  if (!entry?.autokeyDocument || entry.status !== "POSTED") return;
  const partner = entry.lines.find((line) => line.partner)?.partner;

  const reviewed = entry.autokeyDocument.reviewedData as { taxReview?: { whtFormType?: "PND3" | "PND53"; whtRatePercent?: number; incomeType?: string } } | null;
  const taxReview = reviewed?.taxReview;
  if (taxReview?.whtFormType && taxReview.whtRatePercent && taxReview.incomeType) {
    const existingCertificate = await prisma.accWhtCertificate.findFirst({ where: { entryId } });
    if (!existingCertificate) {
      const whtLine = entry.lines.find((line) => line.account.vatRole === "WHT" && line.account.type === "LIABILITY");
      const wht = whtLine ? toSatang(whtLine.credit) - toSatang(whtLine.debit) : 0;
      const base = entry.lines.reduce((sum, line) => {
        const debit = toSatang(line.debit) - toSatang(line.credit);
        return !line.account.vatRole && line.account.type === "EXPENSE" && debit > 0 ? sum + debit : sum;
      }, 0);
      if (wht > 0 && base > 0) {
        await prisma.accWhtCertificate.create({
          data: {
            docNo: await nextWhtDocNo(entry.date), payDate: entry.date, formType: taxReview.whtFormType,
            partnerId: partner?.id ?? null, payeeName: partner?.name || "ไม่ระบุผู้ถูกหัก", payeeTaxId: partner?.taxId ?? null,
            payeeAddress: partner?.address ?? null, payeeBranchTag: partner?.branchTag ?? null,
            incomeType: taxReview.incomeType, baseAmount: toBaht(base), whtRate: taxReview.whtRatePercent / 100,
            whtAmount: toBaht(wht), entryId, createdBy: entry.createdBy,
          },
        });
      }
    }
  }

  const partnerTaxId = partner?.taxId?.replace(/\D/g, "") || null;
  for (const line of entry.lines) {
    const amount = toSatang(line.debit) - toSatang(line.credit);
    if (amount <= 0 || line.account.vatRole || !["EXPENSE", "ASSET"].includes(line.account.type)) continue;
    const keyword = (line.memo || entry.description).trim().toLocaleLowerCase("th-TH").slice(0, 160);
    const scopeKey = createHash("sha256").update(`${partnerTaxId || "-"}|${keyword}|${line.accountId}|${entry.journalType}`).digest("hex");
    await prisma.accAutokeyRule.upsert({
      where: { scopeKey },
      create: { scopeKey, partnerTaxId, keyword, journalType: entry.journalType, accountId: line.accountId },
      update: { timesConfirmed: { increment: 1 }, lastConfirmedAt: new Date(), isActive: true },
    });
  }
}
