import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { revalidateAccountingRef, ACC_JOURNAL_TAG } from "@/lib/accounting/refData";
import { parseDateOnly } from "@/lib/dates";
import { createEntry, AccountingError } from "@/lib/accounting/post";

interface LineInput {
  accountId: string;
  debit?: string | number;
  credit?: string | number;
  branchId?: string;
  partnerId?: string;
  memo?: string;
  docNo?: string;
}

export async function POST(req: NextRequest) {
  const staff = await requireSectionApi("ACCOUNTING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { date, journalType, description, lines, postNow, autokeyDocumentId, autokeyDraftId, autokeyTaxReview } = await req.json();
  if (!date || !description) return NextResponse.json({ error: "กรอกวันที่และคำอธิบายรายการ" }, { status: 400 });
  if (!Array.isArray(lines)) return NextResponse.json({ error: "ไม่มีบรรทัดรายการ" }, { status: 400 });

  try {
    const autokeyDocument = autokeyDocumentId
      ? await prisma.accAutokeyDocument.findUnique({ where: { id: String(autokeyDocumentId) } })
      : null;
    const autokeyDraft = autokeyDraftId
      ? await prisma.accAutokeyDraft.findUnique({ where: { id: String(autokeyDraftId) }, include: { document: true } })
      : null;
    if (autokeyDocumentId && !autokeyDocument) return NextResponse.json({ error: "ไม่พบเอกสาร AI Autokey" }, { status: 404 });
    if (autokeyDraftId && !autokeyDraft) return NextResponse.json({ error: "ไม่พบร่าง AI Autokey ของหน้านี้" }, { status: 404 });
    if (autokeyDocument && autokeyDraft) return NextResponse.json({ error: "ข้อมูลอ้างอิง AI Autokey ซ้ำซ้อน" }, { status: 400 });
    if (autokeyDocument?.entryId) return NextResponse.json({ error: "เอกสารนี้สร้างใบสำคัญแล้ว" }, { status: 409 });
    if (autokeyDraft?.entryId) return NextResponse.json({ error: "หน้าเอกสารนี้สร้างใบสำคัญแล้ว" }, { status: 409 });
    const autokeySource = autokeyDraft?.document ?? autokeyDocument;
    const normalizedTaxReview = autokeySource ? {
      isClaimableVat: autokeyTaxReview?.isClaimableVat !== false,
      whtFormType: ["PND3", "PND53"].includes(autokeyTaxReview?.whtFormType) ? autokeyTaxReview.whtFormType as "PND3" | "PND53" : null,
      whtRatePercent: Number.isFinite(Number(autokeyTaxReview?.whtRatePercent)) ? Number(autokeyTaxReview.whtRatePercent) : null,
      incomeType: String(autokeyTaxReview?.incomeType || "").trim().slice(0, 160) || null,
    } : null;
    if (normalizedTaxReview?.whtFormType && (!(normalizedTaxReview.whtRatePercent && normalizedTaxReview.whtRatePercent > 0 && normalizedTaxReview.whtRatePercent <= 100) || !normalizedTaxReview.incomeType)) {
      return NextResponse.json({ error: "กรุณายืนยันอัตราหักและประเภทเงินได้ก่อนบันทึกร่าง" }, { status: 400 });
    }
    if (autokeySource) {
      const accountIds = (lines as LineInput[]).map((line) => line.accountId).filter(Boolean);
      const taxAccounts = await prisma.accAccount.findMany({
        where: { id: { in: accountIds }, vatRole: { in: ["INPUT", "WHT"] } },
        select: { id: true, vatRole: true, type: true },
      });
      if (!normalizedTaxReview?.isClaimableVat && taxAccounts.some((account) => account.vatRole === "INPUT")) {
        return NextResponse.json({ error: "เลือกภาษีซื้อต้องห้ามแล้ว กรุณารวม VAT เป็นค่าใช้จ่ายและนำบรรทัดบัญชีภาษีซื้อออก" }, { status: 400 });
      }
      if (normalizedTaxReview?.whtFormType && !taxAccounts.some((account) => account.vatRole === "WHT" && account.type === "LIABILITY")) {
        return NextResponse.json({ error: "เลือกหัก ณ ที่จ่ายแล้ว แต่ยังไม่มีบรรทัดบัญชีภาษีหัก ณ ที่จ่าย" }, { status: 400 });
      }
    }
    const entry = await createEntry({
      date: parseDateOnly(date),
      journalType: journalType || "GENERAL",
      description: String(description).trim(),
      // เอกสารจาก AI ต้องเริ่มเป็นร่างเสมอ ต่อให้ client ส่ง postNow ผิดมาก็ห้ามข้ามการตรวจของคน
      status: autokeySource ? "DRAFT" : postNow ? "POSTED" : "DRAFT",
      sourceType: autokeySource ? "AI_AUTOKEY" : null,
      sourceKey: autokeyDraft ? `${autokeyDraft.document.fileHash}:page:${autokeyDraft.pageNumber}` : autokeyDocument?.fileHash ?? null,
      userId: staff.staffId,
      lines: (lines as LineInput[]).map((l) => ({
        accountId: l.accountId,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        branchId: l.branchId || null,
        partnerId: l.partnerId || null,
        memo: l.memo || null,
        docNo: l.docNo || null,
      })),
    });
    if (autokeyDraft) {
      await prisma.accAutokeyDraft.update({
        where: { id: autokeyDraft.id },
        data: {
          entryId: entry.id,
          reviewedBy: staff.staffId,
          reviewedAt: new Date(),
          reviewedData: { date, journalType, description, lines, taxReview: normalizedTaxReview },
        },
      });
      const remaining = await prisma.accAutokeyDraft.count({ where: { documentId: autokeyDraft.documentId, entryId: null } });
      await prisma.accAutokeyDocument.update({
        where: { id: autokeyDraft.documentId },
        data: { status: remaining === 0 ? "DRAFTED" : "REVIEW", reviewedBy: staff.staffId, reviewedAt: new Date() },
      });
    } else if (autokeyDocument) {
      await prisma.accAutokeyDocument.update({
        where: { id: autokeyDocument.id },
        data: {
          entryId: entry.id,
          status: "DRAFTED",
          reviewedBy: staff.staffId,
          reviewedAt: new Date(),
          reviewedData: { date, journalType, description, lines, taxReview: normalizedTaxReview },
        },
      });
    }
    revalidateAccountingRef(ACC_JOURNAL_TAG);
    return NextResponse.json({ entry });
  } catch (e) {
    if (e instanceof AccountingError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
