import { prisma } from "@lamunn/db-finance";
import { parseDateOnly } from "@/lib/dates";
import { getAllSettings } from "@/lib/settings";
import { splitVatInclusive, addVatExclusive, signedInputToSatang, toBaht, toSatang } from "./money";
import { AccountingError, postEntry, unpostEntry, updateEntry } from "./post";
import { SYSTEM_ACCOUNTS } from "./chartOfAccounts";
import { withholdingFromPercent } from "./withholdingMath";
import { parsePurchaseTaxClaimPeriod } from "./purchaseTaxClaimPeriod";
import { purchasePaymentEntryDescriptionFor } from "./purchaseWhtJournals";

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
  description?: string;
  note?: string | null;
  isClaimable?: boolean;
  /** ส่งมาเฉพาะตอนต้องการเปลี่ยนยอด — ระบบจะแยก ฐาน/VAT ใหม่ตามอัตราในตั้งค่า */
  amount?: string | number;
  amountIncludesVat?: boolean;
}

export const entryDescriptionFor = (vendorName: string, invoiceNo: string, isCreditNote = false) =>
  `${isCreditNote ? "ใบลดหนี้" : "ซื้อ"} ${vendorName} ใบกำกับ ${invoiceNo}`;

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
  if (patch.amount !== undefined && str(patch.amount) !== "") {
    const amountSatang = signedInputToSatang(patch.amount);
    if (amountSatang === 0) throw new AccountingError("ยอดเงินต้องไม่เป็น 0");
    const vatRate = opts.vatRate ?? Number((await getAllSettings()).vatRate);
    ({ base, vat } = patch.amountIncludesVat === false ? addVatExclusive(amountSatang, vatRate) : splitVatInclusive(amountSatang, vatRate));
  }

  const amountChanged = base !== toSatang(current.baseAmount) || vat !== toSatang(current.vatAmount);
  const dateChanged = invoiceDate.getTime() !== current.invoiceDate.getTime();
  const identityChanged = invoiceNo !== current.invoiceNo || vendorName !== current.vendorName || vendorTaxId !== current.vendorTaxId;
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

  const paymentEntry = linkedWht?.entryId && linkedWht.entryId !== current.entryId
    ? await prisma.accJournalEntry.findUnique({
        where: { id: linkedWht.entryId },
        include: { lines: { orderBy: { sortOrder: "asc" }, include: { account: { select: { code: true, vatRole: true } } } } },
      })
    : null;

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

    if (!purchaseVatLine || !purchasePayableLine || !paymentPayableLine || !paymentWhtLine || !paymentCashLine) {
      throw new AccountingError(
        `ใบสำคัญ ${entry.entryNo}/${paymentEntry.entryNo} ถูกแก้ไขจนไม่ใช่รูปแบบมาตรฐาน — แก้ยอดที่ใบสำคัญโดยตรงแทน`
      );
    }
    if (paymentWhtLine.account.code === SYSTEM_ACCOUNTS.WHT_PAYABLE && !pnd53Account) {
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
      if (!linkedWhtCalc) throw new AccountingError("ไม่พบยอดภาษีหัก ณ ที่จ่ายที่เชื่อมกับใบสำคัญจ่าย");
      const expenseLine = purchaseExpenseLines[0];
      const total = base + vat;
      await updateEntry(entry.id, {
        date: invoiceDate,
        journalType: "PURCHASE",
        description: entry.description === entryDescriptionFor(current.vendorName, current.invoiceNo, wasCreditNote)
          ? entryDescriptionFor(vendorName, invoiceNo, false)
          : entry.description,
        lines: [
          { accountId: expenseLine.accountId, debit: toBaht(base), partnerId: expenseLine.partnerId, branchId: expenseLine.branchId, memo: expenseLine.memo, docNo: expenseLine.docNo },
          { accountId: purchaseVatLine.accountId, debit: toBaht(vat), partnerId: purchaseVatLine.partnerId, branchId: purchaseVatLine.branchId, memo: purchaseVatLine.memo, docNo: invoiceNo },
          { accountId: purchasePayableLine.accountId, credit: toBaht(total), partnerId: purchasePayableLine.partnerId, branchId: purchasePayableLine.branchId, memo: purchasePayableLine.memo },
        ],
      });
      await updateEntry(paymentEntry.id, {
        date: invoiceDate,
        journalType: "PAYMENT",
        description: paymentEntry.description === purchasePaymentEntryDescriptionFor(current.vendorName, current.invoiceNo)
          ? purchasePaymentEntryDescriptionFor(vendorName, invoiceNo)
          : paymentEntry.description,
        lines: [
          { accountId: paymentPayableLine.accountId, debit: toBaht(total), partnerId: paymentPayableLine.partnerId, branchId: paymentPayableLine.branchId, memo: paymentPayableLine.memo },
          { accountId: paymentCashLine.accountId, credit: toBaht(total - linkedWhtCalc.amount), partnerId: paymentCashLine.partnerId, branchId: paymentCashLine.branchId, memo: paymentCashLine.memo },
          { accountId: pnd53Account?.id ?? paymentWhtLine.accountId, credit: toBaht(linkedWhtCalc.amount), partnerId: paymentWhtLine.partnerId, branchId: paymentWhtLine.branchId, memo: paymentWhtLine.memo },
        ],
      });
    } else {
      if (identityChanged && entry.status === "DRAFT" && entry.description === entryDescriptionFor(current.vendorName, current.invoiceNo, wasCreditNote)) {
        await updateEntry(entry.id, {
          date: entry.date,
          journalType: entry.journalType,
          description: entryDescriptionFor(vendorName, invoiceNo, false),
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
      if (identityChanged && paymentEntry.status === "DRAFT" && paymentEntry.description === purchasePaymentEntryDescriptionFor(current.vendorName, current.invoiceNo)) {
        await updateEntry(paymentEntry.id, {
          date: paymentEntry.date,
          journalType: paymentEntry.journalType,
          description: purchasePaymentEntryDescriptionFor(vendorName, invoiceNo),
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
      const keepOrNew = entry.description === entryDescriptionFor(current.vendorName, current.invoiceNo, wasCreditNote)
        ? entryDescriptionFor(vendorName, invoiceNo, isCreditNote)
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
        description: identityChanged && entry.description === entryDescriptionFor(current.vendorName, current.invoiceNo, wasCreditNote)
          ? entryDescriptionFor(vendorName, invoiceNo, isCreditNote)
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
    } else if (identityChanged && entry.status === "DRAFT" && entry.description === entryDescriptionFor(current.vendorName, current.invoiceNo, wasCreditNote)) {
      await updateEntry(entry.id, {
        date: entry.date,
        journalType: entry.journalType,
        description: entryDescriptionFor(vendorName, invoiceNo, isCreditNote),
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

  if (linkedWht && linkedWhtCalc) {
    await prisma.accWhtCertificate.update({
      where: { id: linkedWht.id },
      data: {
        payDate: invoiceDate,
        payeeName: vendorName,
        payeeTaxId: vendorTaxId,
        payeeBranchTag: vendorBranchTag,
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
      description,
      note,
      isClaimable,
      baseAmount: toBaht(base),
      vatAmount: toBaht(vat),
      totalAmount: toBaht(base + vat),
    },
  });
}
