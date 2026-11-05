import { prisma, Prisma } from "@lamunn/db-finance";
import { parseDateOnly } from "@/lib/dates";
import { getAllSettings } from "@/lib/settings";
import { splitVatInclusive, addVatExclusive, signedInputToSatang, toBaht, toSatang } from "./money";
import { AccountingError, createEntry, postEntry, unpostEntry, updateEntry, voidEntry } from "./post";
import { SYSTEM_ACCOUNTS } from "./chartOfAccounts";
import { withholdingFromPercent } from "./withholdingMath";
import { parsePurchaseTaxClaimPeriod } from "./purchaseTaxClaimPeriod";
import { buildPurchasePaymentJournalLines, purchaseEntryDescriptionFor, purchaseJournalMemo, purchasePaymentEntryDescriptionFor } from "./purchaseWhtJournals";
import { summarizePurchaseTaxLineItems } from "./purchaseTaxLineItems";
import type { VatRounding } from "./money";
import { PurchaseTaxAccountAllocationError, resolvePurchaseTaxAccountAllocations, type PurchaseTaxAccountAllocationInput } from "./purchaseTaxAccountAllocation";
import { WHT_INCOME_TYPES } from "./whtTypes";
import { nextWhtDocNo } from "./withholding";

/** แก้ไขใบกำกับภาษีซื้อที่บันทึกไปแล้ว — ใช้กรณีคีย์เลขที่ใบกำกับ/ชื่อ/ยอดผิด
 *
 * กฎ:
 *  - ใบที่ยกเลิกแล้วแก้ไม่ได้
 *  - เลขที่ใบกำกับ + ผู้ขาย ต้องไม่ซ้ำกับใบอื่นที่ยังใช้อยู่ (กฎเดียวกับตอนบันทึกใหม่)
 *  - ถ้าใบนี้ผูกใบสำคัญไว้: แก้ยอด/วันที่ได้เฉพาะตอนใบสำคัญยังเป็นร่าง (เขียนบรรทัดใหม่ให้ตรงยอด)
 *    ใบสำคัญที่ผ่านรายการแล้วต้องไปกด "ยกเลิกผ่านรายการ" ในสมุดรายวันก่อน — กันงบเพี้ยนเงียบๆ
 *  - แก้เลขที่ใบกำกับ/ชื่อผู้ขาย จะอัปเดตคำอธิบายใบสำคัญให้ด้วย เฉพาะเมื่อคำอธิบายยังเป็นข้อความ
 *    ที่ระบบสร้างให้ตอนแรก (ถ้าบัญชีไปแก้คำอธิบายเองแล้ว จะไม่ทับ)
 */
export interface PurchaseInvoicePatch {
  invoiceNo?: string;
  invoiceDate?: string; // yyyy-mm-dd
  claimPeriod?: string; // yyyy-mm
  vendorName?: string;
  vendorTaxId?: string | null;
  vendorBranchTag?: string | null;
  vendorAddress?: string | null;
  partnerId?: string | null;
  description?: string;
  note?: string | null;
  isClaimable?: boolean;
  /** ส่งมาเฉพาะตอนต้องการเปลี่ยนยอด — ระบบจะแยก ฐาน/VAT ใหม่ตามอัตราในตั้งค่า */
  amount?: string | number;
  amountIncludesVat?: boolean;
  vatRounding?: VatRounding;
  lineItems?: unknown;
  expenseLines?: PurchaseTaxAccountAllocationInput[];
  paymentDate?: string;
  paymentAccountId?: string;
  whtIncomeType?: string;
  whtRatePercent?: string | number;
  whtBaseAmount?: string | number;
}

export const entryDescriptionFor = (vendorName: string, invoiceNo: string, isCreditNote = false, note?: string | null) =>
  purchaseEntryDescriptionFor(vendorName, invoiceNo, isCreditNote, note);

const str = (v: unknown) => String(v ?? "").trim();

/** opts.vatRate — ส่งมาได้จากสคริปต์ทดสอบ (getAllSettings ใช้แคชของ Next ซึ่งไม่มีนอกเซิร์ฟเวอร์) */
export async function updatePurchaseInvoice(
  id: string,
  patch: PurchaseInvoicePatch,
  opts: { vatRate?: number; userId?: string | null } = {}
) {
  const current = await prisma.accPurchaseTaxInvoice.findUnique({
    where: { id },
    include: { whtCertificate: true },
  });
  if (!current) throw new AccountingError("ไม่พบใบกำกับภาษีซื้อนี้");
  if (current.voided) throw new AccountingError("ใบกำกับนี้ถูกยกเลิกไปแล้ว แก้ไขไม่ได้ — บันทึกใบใหม่แทน");

  const invoiceNo = patch.invoiceNo !== undefined ? str(patch.invoiceNo) : current.invoiceNo;
  const vendorName = patch.vendorName !== undefined ? str(patch.vendorName) : current.vendorName;
  const vendorTaxId = patch.vendorTaxId !== undefined ? str(patch.vendorTaxId) || null : current.vendorTaxId;
  const vendorBranchTag = patch.vendorBranchTag !== undefined ? str(patch.vendorBranchTag) || null : current.vendorBranchTag;
  const vendorAddress = patch.vendorAddress !== undefined
    ? str(patch.vendorAddress) || null
    : current.whtCertificate?.payeeAddress ?? null;
  const partnerId = patch.partnerId !== undefined ? str(patch.partnerId) || null : current.partnerId;
  const description = patch.description !== undefined ? str(patch.description) || "ค่าสินค้า/บริการ" : current.description;
  const note = patch.note !== undefined ? str(patch.note) || null : current.note;
  const isClaimable = patch.isClaimable !== undefined ? patch.isClaimable !== false : current.isClaimable;
  const invoiceDate = patch.invoiceDate ? parseDateOnly(patch.invoiceDate) : current.invoiceDate;
  const claimPeriod = patch.claimPeriod !== undefined
    ? parsePurchaseTaxClaimPeriod(patch.claimPeriod, invoiceDate)
    : current.claimPeriod;

  if (!invoiceNo || !vendorName) throw new AccountingError("เลขที่ใบกำกับและชื่อผู้ขายเว้นว่างไม่ได้");

  let base = toSatang(current.baseAmount);
  let vat = toSatang(current.vatAmount);
  let normalizedLineItems: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;
  const vatRate = opts.vatRate ?? Number((await getAllSettings()).vatRate);
  if (patch.lineItems !== undefined) {
    const rounding = patch.vatRounding === "UP" || patch.vatRounding === "DOWN" ? patch.vatRounding : "NEAREST";
    const summary = summarizePurchaseTaxLineItems(patch.lineItems, vatRate, rounding);
    if (summary.errors.length > 0) throw new AccountingError(summary.errors[0]);
    if (summary.hasItems) {
      base = summary.baseSatang;
      vat = summary.vatSatang;
      normalizedLineItems = summary.items as unknown as Prisma.InputJsonValue;
    } else {
      normalizedLineItems = Prisma.JsonNull;
    }
  }
  if (normalizedLineItems === undefined || normalizedLineItems === Prisma.JsonNull) {
    if (patch.amount !== undefined && str(patch.amount) !== "") {
    const amountSatang = signedInputToSatang(patch.amount);
    if (amountSatang === 0) throw new AccountingError("ยอดเงินต้องไม่เป็น 0");
      const rounding = patch.vatRounding === "UP" || patch.vatRounding === "DOWN" ? patch.vatRounding : "NEAREST";
      ({ base, vat } = patch.amountIncludesVat === false ? addVatExclusive(amountSatang, vatRate, rounding) : splitVatInclusive(amountSatang, vatRate));
    }
  }

  const amountChanged = base !== toSatang(current.baseAmount) || vat !== toSatang(current.vatAmount);
  const dateChanged = invoiceDate.getTime() !== current.invoiceDate.getTime();
  const identityChanged = invoiceNo !== current.invoiceNo
    || vendorName !== current.vendorName
    || vendorTaxId !== current.vendorTaxId
    || vendorBranchTag !== current.vendorBranchTag
    || partnerId !== current.partnerId
    || note !== current.note;
  const linkedWht = current.whtCertificate;
  const oldBase = toSatang(current.baseAmount);
  const isCreditNote = base < 0;
  const wasCreditNote = oldBase < 0;
  if (linkedWht && isCreditNote) {
    throw new AccountingError("ใบที่มีหนังสือรับรองหัก ณ ที่จ่ายเปลี่ยนเป็นใบลดหนี้ไม่ได้ กรุณายกเลิกเอกสารแล้วบันทึกใบลดหนี้ใหม่");
  }
  // ถ้าผู้ใช้เคยกำหนดฐานหักเอง ให้คงฐานนั้นไว้; ถ้าเดิมใช้ฐานเต็มจึงขยับตามยอดใบกำกับใหม่
  const linkedWhtBase = linkedWht
    ? (toSatang(linkedWht.baseAmount) === oldBase ? base : toSatang(linkedWht.baseAmount))
    : 0;
  const linkedWhtCalc = linkedWht
    ? withholdingFromPercent(linkedWhtBase, linkedWht.whtRate * 100)
    : null;
  if (linkedWht && (linkedWhtBase <= 0 || linkedWhtBase > base)) {
    throw new AccountingError("ฐานภาษีหัก ณ ที่จ่ายเดิมมากกว่ายอดก่อน VAT ใหม่ กรุณายกเลิกเอกสารแล้วบันทึกใหม่");
  }

  if (identityChanged) {
    const duplicate = await prisma.accPurchaseTaxInvoice.findFirst({
      where: {
        id: { not: id },
        invoiceNo,
        voided: false,
        ...(vendorTaxId ? { vendorTaxId } : { vendorName }),
      },
      select: { invoiceDate: true },
    });
    if (duplicate) {
      throw new AccountingError(
        `ใบกำกับเลขที่ ${invoiceNo} ของผู้ขายรายนี้มีอยู่แล้ว (วันที่ ${duplicate.invoiceDate.toISOString().slice(0, 10)})`
      );
    }
  }

  // ---- ใบสำคัญที่ผูกไว้ ----
  const entry = current.entryId
    ? await prisma.accJournalEntry.findUnique({
        where: { id: current.entryId },
        include: { lines: { orderBy: { sortOrder: "asc" }, include: { account: { select: { code: true, vatRole: true } } } } },
      })
    : null;

  const sourcedPaymentEntry = current.entryId
    ? await prisma.accJournalEntry.findUnique({
        where: { sourceType_sourceKey: { sourceType: "PURCHASE_TAX_PAYMENT", sourceKey: current.entryId } },
        include: { lines: { orderBy: { sortOrder: "asc" }, include: { account: { select: { code: true, vatRole: true } } } } },
      })
    : null;
  const paymentEntry = sourcedPaymentEntry ?? (
    linkedWht?.entryId && linkedWht.entryId !== current.entryId
      ? await prisma.accJournalEntry.findUnique({
          where: { id: linkedWht.entryId },
          include: { lines: { orderBy: { sortOrder: "asc" }, include: { account: { select: { code: true, vatRole: true } } } } },
        })
      : null
  );
  const hasFullAccountingPatch = patch.expenseLines !== undefined;
  let finalEntryId = current.entryId;

  if (hasFullAccountingPatch) {
    const postedEntry = [entry, paymentEntry].find((item) => item?.status === "POSTED");
    if (postedEntry) {
      throw new AccountingError(`ใบสำคัญ ${postedEntry.entryNo} ผ่านรายการแล้ว — ไปกด "ยกเลิกผ่านรายการ" ก่อน จึงจะแก้ส่วนลงบัญชีได้`);
    }
    let allocations: ReturnType<typeof resolvePurchaseTaxAccountAllocations>;
    try {
      allocations = resolvePurchaseTaxAccountAllocations(patch.expenseLines, base);
    } catch (error) {
      if (error instanceof PurchaseTaxAccountAllocationError) throw new AccountingError(error.message);
      throw error;
    }
    const paymentAccountId = str(patch.paymentAccountId);
    const paymentDate = patch.paymentDate ? parseDateOnly(patch.paymentDate) : invoiceDate;
    const whtIncomeType = str(patch.whtIncomeType);
    const whtEnabled = Boolean(whtIncomeType);
    const allowedIncomeType = WHT_INCOME_TYPES.some((item) => item.label === whtIncomeType && item.common !== "PND3");
    const editedWhtBase = str(patch.whtBaseAmount) ? toSatang(patch.whtBaseAmount) : base;
    const editedWht = withholdingFromPercent(editedWhtBase, patch.whtRatePercent ?? 0);

    if (allocations.length > 0 && (!paymentAccountId || !patch.paymentDate)) {
      throw new AccountingError("กรุณาเลือกวันที่จ่ายและบัญชีที่ใช้จ่ายให้ครบ");
    }
    if (whtEnabled) {
      if (isCreditNote) throw new AccountingError("ใบลดหนี้ไม่สร้างภาษีหัก ณ ที่จ่าย");
      if (allocations.length === 0) throw new AccountingError("กรุณาเลือกบัญชีค่าใช้จ่ายก่อนสร้างภาษีหัก ณ ที่จ่าย");
      if (!allowedIncomeType) throw new AccountingError("ประเภทเงินได้หัก ณ ที่จ่ายไม่ถูกต้อง");
      if (!vendorTaxId || !/^\d{13}$/.test(vendorTaxId.replace(/\D/g, ""))) throw new AccountingError("กรุณากรอกเลขประจำตัวผู้เสียภาษีผู้ขาย 13 หลัก");
      if (!vendorAddress) throw new AccountingError("กรุณากรอกที่อยู่ผู้ถูกหักภาษี");
      if (editedWhtBase <= 0 || editedWhtBase > base || editedWht.amount <= 0 || editedWht.amount >= base + vat) throw new AccountingError("ฐานหรืออัตราภาษีหัก ณ ที่จ่ายไม่ถูกต้อง");
    }

    if (allocations.length === 0) {
      if (paymentEntry && paymentEntry.status !== "VOID") await voidEntry(paymentEntry.id, opts.userId);
      if (entry && entry.status !== "VOID") await voidEntry(entry.id, opts.userId);
      if (linkedWht) await prisma.accWhtCertificate.delete({ where: { id: linkedWht.id } });
      finalEntryId = null;
    } else {
      const [inputVatAccount, tradePayableAccount, whtPayableAccount] = await Promise.all([
        prisma.accAccount.findUnique({ where: { code: SYSTEM_ACCOUNTS.INPUT_VAT }, select: { id: true } }),
        prisma.accAccount.findUnique({ where: { code: SYSTEM_ACCOUNTS.TRADE_PAYABLE }, select: { id: true } }),
        whtEnabled ? prisma.accAccount.findUnique({ where: { code: SYSTEM_ACCOUNTS.WHT_PND53_PAYABLE }, select: { id: true } }) : Promise.resolve(null),
      ]);
      if (!inputVatAccount) throw new AccountingError(`ไม่พบบัญชีภาษีซื้อรหัส ${SYSTEM_ACCOUNTS.INPUT_VAT}`);
      if (!isCreditNote && !tradePayableAccount) throw new AccountingError(`ไม่พบบัญชีเจ้าหนี้การค้ารหัส ${SYSTEM_ACCOUNTS.TRADE_PAYABLE}`);
      if (whtEnabled && !whtPayableAccount) throw new AccountingError(`ไม่พบบัญชีภาษีหัก ณ ที่จ่ายรหัส ${SYSTEM_ACCOUNTS.WHT_PND53_PAYABLE}`);

      let savedPurchaseEntryId: string;
      let savedPaymentEntryId: string | null = null;
      if (isCreditNote) {
        const absoluteVat = Math.abs(vat);
        const absoluteTotal = Math.abs(base + vat);
        const lines = [
          ...allocations.map((line, index) => ({ accountId: line.accountId, credit: toBaht(line.amountSatang), partnerId, memo: index === 0 ? purchaseJournalMemo(description, note) : description })),
          { accountId: inputVatAccount.id, credit: toBaht(absoluteVat), memo: "ลดภาษีซื้อ", docNo: invoiceNo },
          { accountId: paymentAccountId, debit: toBaht(absoluteTotal), partnerId, memo: purchaseJournalMemo("ลดเจ้าหนี้/เงินรับคืน", note) },
        ];
        const saved = entry && entry.status !== "VOID"
          ? await updateEntry(entry.id, { date: invoiceDate, journalType: "PURCHASE", description: entryDescriptionFor(vendorName, invoiceNo, true, note), lines })
          : await createEntry({ date: invoiceDate, journalType: "PURCHASE", description: entryDescriptionFor(vendorName, invoiceNo, true, note), userId: opts.userId, lines });
        savedPurchaseEntryId = saved.id;
        if (paymentEntry && paymentEntry.status !== "VOID") await voidEntry(paymentEntry.id, opts.userId);
      } else {
        const drafts = buildPurchasePaymentJournalLines({
          allocations, inputVatAccountId: inputVatAccount.id, tradePayableAccountId: tradePayableAccount!.id,
          paymentAccountId, whtPayableAccountId: whtPayableAccount?.id, baseSatang: base, vatSatang: vat,
          whtSatang: whtEnabled ? editedWht.amount : 0, partnerId, description, note, invoiceNo,
        });
        const savedPurchase = entry && entry.status !== "VOID"
          ? await updateEntry(entry.id, { date: invoiceDate, journalType: "PURCHASE", description: entryDescriptionFor(vendorName, invoiceNo, false, note), lines: drafts.purchaseLines })
          : await createEntry({ date: invoiceDate, journalType: "PURCHASE", description: entryDescriptionFor(vendorName, invoiceNo, false, note), userId: opts.userId, lines: drafts.purchaseLines });
        savedPurchaseEntryId = savedPurchase.id;
        const savedPayment = paymentEntry && paymentEntry.status !== "VOID"
          ? await updateEntry(paymentEntry.id, { date: paymentDate, journalType: "PAYMENT", description: purchasePaymentEntryDescriptionFor(vendorName, invoiceNo, note), lines: drafts.paymentLines })
          : await createEntry({ date: paymentDate, journalType: "PAYMENT", description: purchasePaymentEntryDescriptionFor(vendorName, invoiceNo, note), sourceType: "PURCHASE_TAX_PAYMENT", sourceKey: savedPurchase.id, userId: opts.userId, lines: drafts.paymentLines });
        savedPaymentEntryId = savedPayment.id;
      }
      finalEntryId = savedPurchaseEntryId;

      if (whtEnabled) {
        const certificateData = {
          payDate: paymentDate, partnerId, payeeName: vendorName, payeeTaxId: vendorTaxId?.replace(/\D/g, "") ?? null,
          payeeAddress: vendorAddress, payeeBranchTag: vendorBranchTag, incomeType: whtIncomeType,
          baseAmount: toBaht(editedWhtBase), whtRate: editedWht.rate, whtAmount: toBaht(editedWht.amount),
          entryId: savedPaymentEntryId ?? savedPurchaseEntryId, note,
        };
        if (linkedWht) await prisma.accWhtCertificate.update({ where: { id: linkedWht.id }, data: certificateData });
        else await prisma.accWhtCertificate.create({ data: { ...certificateData, docNo: await nextWhtDocNo(paymentDate), formType: "PND53", purchaseInvoiceId: id, createdBy: opts.userId } });
      } else if (linkedWht) {
        await prisma.accWhtCertificate.delete({ where: { id: linkedWht.id } });
      }
    }
  } else

  if (entry && paymentEntry && entry.status !== "VOID" && paymentEntry.status !== "VOID") {
    const purchaseVatLine = entry.lines.find((line) => line.account.vatRole === "INPUT");
    const purchasePayableLine = entry.lines.find((line) => line.account.code === SYSTEM_ACCOUNTS.TRADE_PAYABLE && toSatang(line.credit) > 0);
    const purchaseExpenseLines = entry.lines.filter((line) => line !== purchaseVatLine && line !== purchasePayableLine);
    const paymentPayableLine = paymentEntry.lines.find((line) => line.account.code === SYSTEM_ACCOUNTS.TRADE_PAYABLE && toSatang(line.debit) > 0);
    const paymentWhtLine = paymentEntry.lines.find((line) =>
      (line.account.code === SYSTEM_ACCOUNTS.WHT_PND53_PAYABLE || line.account.code === SYSTEM_ACCOUNTS.WHT_PAYABLE)
      && toSatang(line.credit) > 0
    );
    const paymentCashLine = paymentEntry.lines.find((line) => line !== paymentPayableLine && line !== paymentWhtLine && toSatang(line.credit) > 0);
    const pnd53Account = paymentWhtLine?.account.code === SYSTEM_ACCOUNTS.WHT_PAYABLE
      ? await prisma.accAccount.findUnique({ where: { code: SYSTEM_ACCOUNTS.WHT_PND53_PAYABLE } })
      : null;

    if (!purchaseVatLine || !purchasePayableLine || !paymentPayableLine || !paymentCashLine || (linkedWht && !paymentWhtLine)) {
      throw new AccountingError(
        `ใบสำคัญ ${entry.entryNo}/${paymentEntry.entryNo} ถูกแก้ไขจนไม่ใช่รูปแบบมาตรฐาน — แก้ยอดที่ใบสำคัญโดยตรงแทน`
      );
    }
    if (paymentWhtLine?.account.code === SYSTEM_ACCOUNTS.WHT_PAYABLE && !pnd53Account) {
      throw new AccountingError(`ไม่พบบัญชีภาษีหัก ณ ที่จ่าย - ภ.ง.ด.53 รหัส ${SYSTEM_ACCOUNTS.WHT_PND53_PAYABLE} ในผังบัญชี`);
    }

    if (amountChanged || dateChanged) {
      const postedEntry = [entry, paymentEntry].find((item) => item.status === "POSTED");
      if (postedEntry) {
        throw new AccountingError(
          `ใบสำคัญ ${postedEntry.entryNo} ผ่านรายการแล้ว — ไปกด "ยกเลิกผ่านรายการ" ในสมุดรายวันก่อน จึงจะแก้ยอดเงินหรือวันที่ได้`
        );
      }
      if (purchaseExpenseLines.length !== 1) {
        throw new AccountingError(
          `ใบสำคัญ ${entry.entryNo} แบ่งค่าใช้จ่ายหลายบัญชี — แก้ยอดที่ใบสำคัญโดยตรงเพื่อระบุยอดแต่ละบัญชี`
        );
      }
      if (linkedWht && !linkedWhtCalc) throw new AccountingError("ไม่พบยอดภาษีหัก ณ ที่จ่ายที่เชื่อมกับใบสำคัญจ่าย");
      const expenseLine = purchaseExpenseLines[0];
      const total = base + vat;
      await updateEntry(entry.id, {
        date: invoiceDate,
        journalType: "PURCHASE",
        description: entry.description === entryDescriptionFor(current.vendorName, current.invoiceNo, wasCreditNote, current.note)
          ? entryDescriptionFor(vendorName, invoiceNo, false, note)
          : entry.description,
        lines: [
          { accountId: expenseLine.accountId, debit: toBaht(base), partnerId: expenseLine.partnerId, branchId: expenseLine.branchId, memo: expenseLine.memo, docNo: expenseLine.docNo },
          { accountId: purchaseVatLine.accountId, debit: toBaht(vat), partnerId: purchaseVatLine.partnerId, branchId: purchaseVatLine.branchId, memo: purchaseVatLine.memo, docNo: invoiceNo },
          { accountId: purchasePayableLine.accountId, credit: toBaht(total), partnerId: purchasePayableLine.partnerId, branchId: purchasePayableLine.branchId, memo: purchasePayableLine.memo },
        ],
      });
      await updateEntry(paymentEntry.id, {
        date: paymentEntry.date,
        journalType: "PAYMENT",
        description: paymentEntry.description === purchasePaymentEntryDescriptionFor(current.vendorName, current.invoiceNo, current.note)
          ? purchasePaymentEntryDescriptionFor(vendorName, invoiceNo, note)
          : paymentEntry.description,
        lines: [
          { accountId: paymentPayableLine.accountId, debit: toBaht(total), partnerId: paymentPayableLine.partnerId, branchId: paymentPayableLine.branchId, memo: paymentPayableLine.memo },
          { accountId: paymentCashLine.accountId, credit: toBaht(total - (linkedWhtCalc?.amount ?? 0)), partnerId: paymentCashLine.partnerId, branchId: paymentCashLine.branchId, memo: paymentCashLine.memo },
          ...(linkedWhtCalc && paymentWhtLine
            ? [{ accountId: pnd53Account?.id ?? paymentWhtLine.accountId, credit: toBaht(linkedWhtCalc.amount), partnerId: paymentWhtLine.partnerId, branchId: paymentWhtLine.branchId, memo: paymentWhtLine.memo }]
            : []),
        ],
      });
    } else {
      if (identityChanged && entry.status === "DRAFT" && entry.description === entryDescriptionFor(current.vendorName, current.invoiceNo, wasCreditNote, current.note)) {
        await updateEntry(entry.id, {
          date: entry.date,
          journalType: entry.journalType,
          description: entryDescriptionFor(vendorName, invoiceNo, false, note),
          lines: entry.lines.map((line) => ({
            accountId: line.accountId,
            debit: Number(line.debit),
            credit: Number(line.credit),
            partnerId: line.partnerId,
            branchId: line.branchId,
            channel: line.channel,
            memo: line.memo,
            docNo: line.account.vatRole === "INPUT" ? invoiceNo : line.docNo,
          })),
        });
      }
      if (identityChanged && paymentEntry.status === "DRAFT" && paymentEntry.description === purchasePaymentEntryDescriptionFor(current.vendorName, current.invoiceNo, current.note)) {
        await updateEntry(paymentEntry.id, {
          date: paymentEntry.date,
          journalType: paymentEntry.journalType,
          description: purchasePaymentEntryDescriptionFor(vendorName, invoiceNo, note),
          lines: paymentEntry.lines.map((line) => ({
            accountId: line.accountId,
            debit: Number(line.debit),
            credit: Number(line.credit),
            partnerId: line.partnerId,
            branchId: line.branchId,
            channel: line.channel,
            memo: line.memo,
            docNo: line.docNo,
          })),
        });
      }
    }
  } else if (entry && entry.status !== "VOID") {
    const legacyWhtLine = linkedWht?.formType === "PND53"
      ? entry.lines.find((line) => line.account.code === SYSTEM_ACCOUNTS.WHT_PAYABLE && toSatang(line.credit) > 0)
      : null;
    const pnd53Account = legacyWhtLine
      ? await prisma.accAccount.findUnique({ where: { code: SYSTEM_ACCOUNTS.WHT_PND53_PAYABLE } })
      : null;
    if (legacyWhtLine && !pnd53Account) {
      throw new AccountingError(`ไม่พบบัญชีภาษีหัก ณ ที่จ่าย - ภ.ง.ด.53 รหัส ${SYSTEM_ACCOUNTS.WHT_PND53_PAYABLE} ในผังบัญชี`);
    }

    if (amountChanged || dateChanged) {
      if (entry.status === "POSTED") {
        throw new AccountingError(
          `ใบสำคัญ ${entry.entryNo} ผ่านรายการแล้ว — ไปกด "ยกเลิกผ่านรายการ" ในสมุดรายวันก่อน จึงจะแก้ยอดเงินหรือวันที่ของใบกำกับนี้ได้`
        );
      }
      const vatLine = entry.lines.find((l) => l.account.vatRole === "INPUT");
      const whtLine = linkedWht
        // ใบเก่าก่อนแยก ภ.ง.ด.53 ยังใช้ 2130 จึงต้องหาได้ทั้งสองรหัสก่อนย้ายไป 27124
        ? entry.lines.find((l) =>
            (l.account.code === SYSTEM_ACCOUNTS.WHT_PND53_PAYABLE || l.account.code === SYSTEM_ACCOUNTS.WHT_PAYABLE)
            && toSatang(l.credit) > 0
          )
        : null;
      // ใบที่ระบบสร้างเรียง ค่าใช้จ่าย → VAT → เงิน/เจ้าหนี้ → WHT เสมอ จึงใช้ลำดับแทนการเดาจากด้านบัญชี
      // เพราะเมื่อเปลี่ยนเป็นใบลดหนี้ ทุกบรรทัดจะสลับด้านพร้อมกัน
      const nonTaxLines = entry.lines.filter((l) => l !== vatLine && l !== whtLine);
      const [expenseLine, settlementLine] = nonTaxLines;
      const expectedLineCount = linkedWht ? 4 : 3;
      if (entry.lines.length !== expectedLineCount || !vatLine || !expenseLine || !settlementLine || (linkedWht && !whtLine)) {
        throw new AccountingError(
          `ใบสำคัญ ${entry.entryNo} ถูกแก้ไขจนไม่ใช่รูปแบบมาตรฐาน (ค่าใช้จ่าย/ภาษีซื้อ/ยอดจ่าย/ภาษีหัก) — แก้ยอดที่ใบสำคัญโดยตรงแทน`
        );
      }
      const keepOrNew = entry.description === entryDescriptionFor(current.vendorName, current.invoiceNo, wasCreditNote, current.note)
        ? entryDescriptionFor(vendorName, invoiceNo, isCreditNote, note)
        : entry.description;
      const absoluteBase = Math.abs(base);
      const absoluteVat = Math.abs(vat);
      const absoluteTotal = Math.abs(base + vat);
      await updateEntry(entry.id, {
        date: invoiceDate,
        journalType: entry.journalType,
        description: keepOrNew,
        lines: isCreditNote ? [
          { accountId: expenseLine.accountId, credit: toBaht(absoluteBase), partnerId: expenseLine.partnerId, branchId: expenseLine.branchId, memo: expenseLine.memo, docNo: expenseLine.docNo },
          { accountId: vatLine.accountId, credit: toBaht(absoluteVat), partnerId: vatLine.partnerId, branchId: vatLine.branchId, memo: vatLine.memo, docNo: vatLine.docNo },
          { accountId: settlementLine.accountId, debit: toBaht(absoluteTotal), partnerId: settlementLine.partnerId, branchId: settlementLine.branchId, memo: settlementLine.memo, docNo: settlementLine.docNo },
        ] : [
          { accountId: expenseLine.accountId, debit: toBaht(base), partnerId: expenseLine.partnerId, branchId: expenseLine.branchId, memo: expenseLine.memo, docNo: expenseLine.docNo },
          { accountId: vatLine.accountId, debit: toBaht(vat), partnerId: vatLine.partnerId, branchId: vatLine.branchId, memo: vatLine.memo, docNo: vatLine.docNo },
          { accountId: settlementLine.accountId, credit: toBaht(base + vat - (linkedWhtCalc?.amount ?? 0)), partnerId: settlementLine.partnerId, branchId: settlementLine.branchId, memo: settlementLine.memo, docNo: settlementLine.docNo },
          ...(linkedWht && whtLine && linkedWhtCalc
            ? [{ accountId: pnd53Account?.id ?? whtLine.accountId, credit: toBaht(linkedWhtCalc.amount), partnerId: whtLine.partnerId, branchId: whtLine.branchId, memo: whtLine.memo, docNo: whtLine.docNo }]
            : []),
        ],
      });
    } else if (legacyWhtLine && pnd53Account) {
      const wasPosted = entry.status === "POSTED";
      // ถอนและผ่านรายการกลับทันทีเพื่อให้การย้ายบัญชีใช้กฎงวด/สมดุลจาก post.ts ครบ และผู้ใช้ไม่ต้องไล่แก้ใบเก่าทีละขั้น
      if (wasPosted) await unpostEntry(entry.id, opts.userId);
      await updateEntry(entry.id, {
        date: entry.date,
        journalType: entry.journalType,
        description: identityChanged && entry.description === entryDescriptionFor(current.vendorName, current.invoiceNo, wasCreditNote, current.note)
          ? entryDescriptionFor(vendorName, invoiceNo, isCreditNote, note)
          : entry.description,
        lines: entry.lines.map((line) => ({
          accountId: line.id === legacyWhtLine.id ? pnd53Account.id : line.accountId,
          debit: Number(line.debit),
          credit: Number(line.credit),
          partnerId: line.partnerId,
          branchId: line.branchId,
          channel: line.channel,
          memo: line.memo,
          docNo: line.docNo,
        })),
      });
      if (wasPosted) await postEntry(entry.id, opts.userId);
    } else if (identityChanged && entry.status === "DRAFT" && entry.description === entryDescriptionFor(current.vendorName, current.invoiceNo, wasCreditNote, current.note)) {
      await updateEntry(entry.id, {
        date: entry.date,
        journalType: entry.journalType,
        description: entryDescriptionFor(vendorName, invoiceNo, isCreditNote, note),
        lines: entry.lines.map((line) => ({
          accountId: line.accountId,
          debit: Number(line.debit),
          credit: Number(line.credit),
          partnerId: line.partnerId,
          branchId: line.branchId,
          channel: line.channel,
          memo: line.memo,
          docNo: line.account.vatRole === "INPUT" ? invoiceNo : line.docNo,
        })),
      });
    }
  }

  if (!hasFullAccountingPatch && linkedWht && linkedWhtCalc) {
    await prisma.accWhtCertificate.update({
      where: { id: linkedWht.id },
      data: {
        payDate: paymentEntry?.date ?? linkedWht.payDate,
        payeeName: vendorName,
        payeeTaxId: vendorTaxId,
        payeeBranchTag: vendorBranchTag,
        payeeAddress: vendorAddress,
        partnerId,
        baseAmount: toBaht(linkedWhtBase),
        whtAmount: toBaht(linkedWhtCalc.amount),
        note,
      },
    });
  }

  return prisma.accPurchaseTaxInvoice.update({
    where: { id },
    data: {
      invoiceNo,
      invoiceDate,
      claimPeriod,
      vendorName,
      vendorTaxId,
      vendorBranchTag,
      partnerId,
      description,
      note,
      isClaimable,
      entryId: finalEntryId,
      ...(normalizedLineItems !== undefined ? { lineItems: normalizedLineItems } : {}),
      baseAmount: toBaht(base),
      vatAmount: toBaht(vat),
      totalAmount: toBaht(base + vat),
    },
  });
}
