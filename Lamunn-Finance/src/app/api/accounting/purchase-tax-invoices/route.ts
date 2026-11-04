import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { parseDateOnly } from "@/lib/dates";
import { getAllSettings } from "@/lib/settings";
import { splitVatInclusive, addVatExclusive, signedInputToSatang, toBaht, toSatang } from "@/lib/accounting/money";
import { createEntry, voidEntry, AccountingError } from "@/lib/accounting/post";
import { SYSTEM_ACCOUNTS } from "@/lib/accounting/chartOfAccounts";
import { WHT_INCOME_TYPES } from "@/lib/accounting/whtTypes";
import { nextWhtDocNo } from "@/lib/accounting/withholding";
import { withholdingFromPercent } from "@/lib/accounting/withholdingMath";
import { parsePurchaseTaxClaimPeriod } from "@/lib/accounting/purchaseTaxClaimPeriod";
import {
  PurchaseTaxAccountAllocationError,
  resolvePurchaseTaxAccountAllocations,
} from "@/lib/accounting/purchaseTaxAccountAllocation";
import { buildPurchasePaymentJournalLines, purchaseJournalMemo, purchasePaymentEntryDescriptionFor } from "@/lib/accounting/purchaseWhtJournals";
import { summarizePurchaseTaxLineItems } from "@/lib/accounting/purchaseTaxLineItems";

/** บันทึกใบกำกับภาษีซื้อ (ใบที่ผู้ขายออกให้เรา) — ตัวป้อนข้อมูลของรายงานภาษีซื้อและ ภ.พ.30
 * เลขที่ใบกำกับมาจากผู้ขาย ไม่ได้รันเอง จึงรับค่าจากผู้กรอกโดยตรง */
export async function POST(req: NextRequest) {
  const staff = await requireSectionApi("ACCOUNTING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    invoiceNo,
    invoiceDate,
    claimPeriod,
    partnerId,
    vendorName,
    vendorTaxId,
    vendorAddress,
    vendorBranchTag,
    description,
    amount,
    amountIncludesVat,
    vatRounding,
    isClaimable,
    note,
    expenseLines,
    expenseAccountId,
    paymentDate,
    paymentAccountId,
    whtIncomeType,
    whtRatePercent,
    whtBaseAmount,
    lineItems,
  } = body;

  if (!invoiceNo || !invoiceDate || !vendorName) {
    return NextResponse.json({ error: "กรอกเลขที่ใบกำกับ วันที่ และชื่อผู้ขายให้ครบ" }, { status: 400 });
  }

  const settings = await getAllSettings();
  const vatRate = Number(settings.vatRate);
  const rounding = vatRounding === "UP" || vatRounding === "DOWN" ? vatRounding : "NEAREST";
  const itemSummary = summarizePurchaseTaxLineItems(lineItems, vatRate, rounding);
  if (itemSummary.errors.length > 0) {
    return NextResponse.json({ error: itemSummary.errors[0] }, { status: 400 });
  }
  if (!itemSummary.hasItems && !amount) {
    return NextResponse.json({ error: "กรอกยอดเงินหรือรายละเอียดสินค้าอย่างน้อย 1 บรรทัด" }, { status: 400 });
  }
  const amountSatang = itemSummary.hasItems ? itemSummary.baseSatang : signedInputToSatang(amount);
  if (amountSatang === 0) return NextResponse.json({ error: "ยอดเงินต้องไม่เป็น 0" }, { status: 400 });
  const isCreditNote = amountSatang < 0;
  const calculated = itemSummary.hasItems
    ? { base: itemSummary.baseSatang, vat: itemSummary.vatSatang }
    : amountIncludesVat === false
      ? addVatExclusive(amountSatang, vatRate, rounding)
      : splitVatInclusive(amountSatang, vatRate);
  const { base, vat } = calculated;
  const invoiceDateValue = parseDateOnly(invoiceDate);
  const paymentDateValue = paymentDate ? parseDateOnly(paymentDate) : invoiceDateValue;
  let claimPeriodValue: Date;
  try {
    claimPeriodValue = parsePurchaseTaxClaimPeriod(claimPeriod, invoiceDateValue);
  } catch (e) {
    if (e instanceof AccountingError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  const whtEnabled = Boolean(String(whtIncomeType ?? "").trim());
  const journalNote = String(note ?? "").trim() || null;
  const allowedIncomeType = WHT_INCOME_TYPES.some(
    (item) => item.label === String(whtIncomeType ?? "").trim() && item.common !== "PND3"
  );
  const whtBase = String(whtBaseAmount ?? "").trim() ? toSatang(whtBaseAmount) : base;
  const wht = withholdingFromPercent(whtBase, whtRatePercent ?? 0);

  let accountAllocations: ReturnType<typeof resolvePurchaseTaxAccountAllocations>;
  try {
    accountAllocations = resolvePurchaseTaxAccountAllocations(expenseLines, base, expenseAccountId);
  } catch (error) {
    if (error instanceof PurchaseTaxAccountAllocationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  if (accountAllocations.length > 0 && (!paymentAccountId || !paymentDate)) {
    return NextResponse.json({ error: "ถ้าต้องการลงบัญชีอัตโนมัติ กรุณาเลือกวันที่จ่ายและบัญชีที่ใช้จ่ายให้ครบ" }, { status: 400 });
  }
  if (whtEnabled) {
    if (isCreditNote) return NextResponse.json({ error: "ใบลดหนี้ไม่สร้างภาษีหัก ณ ที่จ่าย กรุณาเลือก 'ไม่หักภาษี ณ ที่จ่าย'" }, { status: 400 });
    if (!allowedIncomeType) return NextResponse.json({ error: "ประเภทเงินได้หัก ณ ที่จ่ายไม่ถูกต้อง" }, { status: 400 });
    if (!String(vendorTaxId ?? "").trim() || !/^\d{13}$/.test(String(vendorTaxId).replace(/\D/g, ""))) {
      return NextResponse.json({ error: "กรุณากรอกเลขประจำตัวผู้เสียภาษีผู้ขาย 13 หลักเพื่อออกหนังสือรับรอง" }, { status: 400 });
    }
    if (!String(vendorAddress ?? "").trim()) {
      return NextResponse.json({ error: "กรุณากรอกที่อยู่ผู้ถูกหักภาษีเพื่อออกหนังสือรับรอง" }, { status: 400 });
    }
    if (whtBase <= 0 || whtBase > base) {
      return NextResponse.json({ error: "ฐานภาษีหัก ณ ที่จ่ายต้องมากกว่า 0 และไม่เกินมูลค่าก่อน VAT" }, { status: 400 });
    }
    if (wht.percent <= 0 || wht.percent >= 100 || wht.amount <= 0 || wht.amount >= base + vat) {
      return NextResponse.json({ error: "อัตราหรือยอดภาษีหัก ณ ที่จ่ายไม่ถูกต้อง" }, { status: 400 });
    }
  }

  // กันบันทึกใบเดิมซ้ำ — ผู้ขายรายเดียวกันออกเลขที่ใบกำกับซ้ำไม่ได้
  const duplicate = await prisma.accPurchaseTaxInvoice.findFirst({
    where: {
      invoiceNo: String(invoiceNo).trim(),
      voided: false,
      ...(vendorTaxId ? { vendorTaxId: String(vendorTaxId).trim() } : { vendorName: String(vendorName).trim() }),
    },
    select: { id: true, invoiceDate: true },
  });
  if (duplicate) {
    return NextResponse.json(
      { error: `ใบกำกับเลขที่ ${invoiceNo} ของผู้ขายรายนี้ถูกบันทึกไว้แล้ว (วันที่ ${duplicate.invoiceDate.toISOString().slice(0, 10)})` },
      { status: 400 }
    );
  }

  // ลงบัญชีให้เลยถ้าเลือกบัญชีมาครบ — ผูก entryId ไว้ด้วย เพื่อไม่ให้รายงานภาษีซื้อ
  // นับซ้ำกับใบสำคัญใบเดียวกันที่ถูกดึงมาจากสมุดรายวัน (ดู journalTaxLines.ts)
  let entryId: string | null = null;
  let paymentEntryId: string | null = null;
  if (accountAllocations.length > 0 && paymentAccountId) {
    const [inputVatAccount, whtPayableAccount, tradePayableAccount] = await Promise.all([
      prisma.accAccount.findUnique({ where: { code: SYSTEM_ACCOUNTS.INPUT_VAT }, select: { id: true } }),
      whtEnabled
        ? prisma.accAccount.findUnique({ where: { code: SYSTEM_ACCOUNTS.WHT_PND53_PAYABLE }, select: { id: true } })
        : Promise.resolve(null),
      prisma.accAccount.findUnique({ where: { code: SYSTEM_ACCOUNTS.TRADE_PAYABLE }, select: { id: true } }),
    ]);
    if (!inputVatAccount) {
      return NextResponse.json({ error: `ไม่พบบัญชีภาษีซื้อรหัส ${SYSTEM_ACCOUNTS.INPUT_VAT} ในผังบัญชี` }, { status: 400 });
    }
    if (whtEnabled && !whtPayableAccount) {
      return NextResponse.json({ error: `ไม่พบบัญชีภาษีหัก ณ ที่จ่าย - ภ.ง.ด.53 รหัส ${SYSTEM_ACCOUNTS.WHT_PND53_PAYABLE} ในผังบัญชี` }, { status: 400 });
    }
    if (!isCreditNote && !tradePayableAccount) {
      return NextResponse.json({ error: `ไม่พบบัญชีเจ้าหนี้การค้ารหัส ${SYSTEM_ACCOUNTS.TRADE_PAYABLE} ในผังบัญชี` }, { status: 400 });
    }
    try {
      const absoluteVat = Math.abs(vat);
      const absoluteTotal = Math.abs(base + vat);
      const paymentDrafts = !isCreditNote && tradePayableAccount
        ? buildPurchasePaymentJournalLines({
            allocations: accountAllocations,
            inputVatAccountId: inputVatAccount.id,
            tradePayableAccountId: tradePayableAccount.id,
            paymentAccountId,
            whtPayableAccountId: whtPayableAccount?.id,
            baseSatang: base,
            vatSatang: vat,
            whtSatang: whtEnabled ? wht.amount : 0,
            partnerId: partnerId || null,
            description,
            note: journalNote,
            invoiceNo: String(invoiceNo).trim(),
          })
        : null;
      const purchaseEntry = await createEntry({
        date: invoiceDateValue,
        journalType: "PURCHASE",
        description: `${isCreditNote ? "ใบลดหนี้" : "ซื้อ"} ${String(vendorName).trim()} ใบกำกับ ${String(invoiceNo).trim()}`,
        userId: staff.staffId,
        lines: paymentDrafts ? paymentDrafts.purchaseLines : isCreditNote ? [
          ...accountAllocations.map((line, index) => ({
            accountId: line.accountId,
            credit: toBaht(line.amountSatang),
            partnerId: partnerId || null,
            memo: index === 0 ? purchaseJournalMemo(description, journalNote) : description || undefined,
          })),
          { accountId: inputVatAccount.id, credit: toBaht(absoluteVat), memo: "ลดภาษีซื้อ", docNo: String(invoiceNo).trim() },
          { accountId: paymentAccountId, debit: toBaht(absoluteTotal), partnerId: partnerId || null, memo: purchaseJournalMemo("ลดเจ้าหนี้/เงินรับคืน", journalNote) },
        ] : [
          ...accountAllocations.map((line, index) => ({
            accountId: line.accountId,
            debit: toBaht(line.amountSatang),
            partnerId: partnerId || null,
            memo: index === 0 ? purchaseJournalMemo(description, journalNote) : description || undefined,
          })),
          { accountId: inputVatAccount.id, debit: toBaht(vat), memo: "ภาษีซื้อ", docNo: String(invoiceNo).trim() },
          { accountId: paymentAccountId, credit: toBaht(base + vat), partnerId: partnerId || null },
        ],
      });
      entryId = purchaseEntry.id;
      if (paymentDrafts) {
        const paymentEntry = await createEntry({
          date: paymentDateValue,
          journalType: "PAYMENT",
          description: purchasePaymentEntryDescriptionFor(String(vendorName).trim(), String(invoiceNo).trim()),
          // ใช้รหัสใบซื้อเป็นกุญแจเชื่อม จึงตามแก้/ยกเลิกใบจ่ายได้โดยไม่ต้องเพิ่มคอลัมน์ฐานข้อมูลใหม่
          sourceType: "PURCHASE_TAX_PAYMENT",
          sourceKey: purchaseEntry.id,
          userId: staff.staffId,
          lines: paymentDrafts.paymentLines,
        });
        paymentEntryId = paymentEntry.id;
      }
    } catch (e) {
      // หากสร้างใบจ่ายไม่สำเร็จ ใบซื้อที่เพิ่งสร้างต้องไม่ค้างเป็นร่างโดดเดี่ยวให้คนเผลอผ่านรายการ
      if (entryId) await voidEntry(entryId, staff.staffId).catch(() => undefined);
      if (e instanceof AccountingError) return NextResponse.json({ error: e.message }, { status: 400 });
      throw e;
    }
  }

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
    const invoice = await tx.accPurchaseTaxInvoice.create({
      data: {
        invoiceNo: String(invoiceNo).trim(),
        invoiceDate: invoiceDateValue,
        claimPeriod: claimPeriodValue,
        partnerId: partnerId || null,
        vendorName: String(vendorName).trim(),
        vendorTaxId: vendorTaxId || null,
        vendorBranchTag: vendorBranchTag || null,
        description: description || "ค่าสินค้า/บริการ",
        lineItems: itemSummary.hasItems ? itemSummary.items as unknown as Prisma.InputJsonValue : undefined,
        baseAmount: toBaht(base),
        vatAmount: toBaht(vat),
        totalAmount: toBaht(base + vat),
        isClaimable: isClaimable !== false,
        entryId,
        note: note || null,
        createdBy: staff.staffId,
      },
    });
    const certificate = whtEnabled
      ? await tx.accWhtCertificate.create({
          data: {
            docNo: await nextWhtDocNo(invoiceDateValue, tx),
            payDate: paymentDateValue,
            formType: "PND53",
            partnerId: partnerId || null,
            purchaseInvoiceId: invoice.id,
            payeeName: String(vendorName).trim(),
            payeeTaxId: String(vendorTaxId).replace(/\D/g, ""),
            payeeAddress: String(vendorAddress).trim(),
            payeeBranchTag: vendorBranchTag || null,
            incomeType: String(whtIncomeType).trim(),
            baseAmount: toBaht(whtBase),
            whtRate: wht.rate,
            whtAmount: toBaht(wht.amount),
            entryId: paymentEntryId ?? entryId,
            note: note || null,
            createdBy: staff.staffId,
          },
        })
      : null;
      return { invoice, certificate };
    });
  } catch (error) {
    for (const linkedId of [paymentEntryId, entryId]) {
      if (linkedId) await voidEntry(linkedId, staff.staffId).catch(() => undefined);
    }
    throw error;
  }

  return NextResponse.json(result);
}
