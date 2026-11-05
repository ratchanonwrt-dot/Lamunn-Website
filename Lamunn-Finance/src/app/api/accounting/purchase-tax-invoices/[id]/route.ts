import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { AccountingError } from "@/lib/accounting/post";
import { updatePurchaseInvoice } from "@/lib/accounting/purchaseInvoiceEdit";
import { voidPurchaseTaxInvoice } from "@/lib/accounting/purchaseInvoiceVoid";

/** อ่านใบกำกับภาษีซื้อหนึ่งใบพร้อมสถานะใบสำคัญที่ผูกไว้ — หน้าจอแก้ไขใช้ตัดสินว่าให้แก้ยอด/วันที่ได้ไหม */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireSectionApi("ACCOUNTING", "view");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const invoice = await prisma.accPurchaseTaxInvoice.findUnique({
    where: { id: params.id },
    include: {
      whtCertificate: true,
      partner: {
        include: {
          branches: {
            where: { isActive: true },
            orderBy: [{ isDefault: "desc" }, { branchTag: "asc" }],
          },
        },
      },
    },
  });
  if (!invoice) return NextResponse.json({ error: "ไม่พบใบกำกับภาษีซื้อนี้" }, { status: 404 });
  const entry = invoice.entryId
    ? await prisma.accJournalEntry.findUnique({
        where: { id: invoice.entryId },
        select: {
          id: true, entryNo: true, status: true, date: true, journalType: true, description: true,
          lines: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, accountId: true, debit: true, credit: true, memo: true, account: { select: { code: true, nameTh: true, vatRole: true } } },
          },
        },
      })
    : null;
  const sourcedPaymentEntry = invoice.entryId
    ? await prisma.accJournalEntry.findUnique({
        where: { sourceType_sourceKey: { sourceType: "PURCHASE_TAX_PAYMENT", sourceKey: invoice.entryId } },
        select: {
          id: true, entryNo: true, status: true, date: true, journalType: true, description: true,
          lines: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, accountId: true, debit: true, credit: true, memo: true, account: { select: { code: true, nameTh: true, vatRole: true } } },
          },
        },
      })
    : null;
  const paymentEntry = sourcedPaymentEntry ?? (
    invoice.whtCertificate?.entryId && invoice.whtCertificate.entryId !== invoice.entryId
      ? await prisma.accJournalEntry.findUnique({
          where: { id: invoice.whtCertificate.entryId },
          select: {
            id: true, entryNo: true, status: true, date: true, journalType: true, description: true,
            lines: {
              orderBy: { sortOrder: "asc" },
              select: { id: true, accountId: true, debit: true, credit: true, memo: true, account: { select: { code: true, nameTh: true, vatRole: true } } },
            },
          },
        })
      : null
  );
  const [expenseAccounts, paymentAccounts, partners] = await Promise.all([
    prisma.accAccount.findMany({
      where: { isActive: true, isPostable: true, type: { in: ["EXPENSE", "ASSET"] }, vatRole: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true, nameTh: true },
    }),
    prisma.accPartner.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, type: true, phone: true, taxId: true, branchTag: true, address: true,
        branches: { where: { isActive: true }, orderBy: [{ isDefault: "desc" }, { branchTag: "asc" }], select: { id: true, branchTag: true, address: true, isDefault: true, isActive: true } },
      },
    }),
    prisma.accAccount.findMany({
      where: { isActive: true, isPostable: true, type: "ASSET", vatRole: null, OR: [{ code: { startsWith: "111" } }, { code: { startsWith: "112" } }] },
      orderBy: { code: "asc" },
      select: { id: true, code: true, nameTh: true },
    }),
  ]);
  const isCreditNote = Number(invoice.baseAmount) < 0;
  const purchaseExpenseLines = entry?.lines.filter((line) =>
    line.account.vatRole !== "INPUT"
    && !["2110", "2130", "27124"].includes(line.account.code)
    && (isCreditNote ? Number(line.credit) > 0 : Number(line.debit) > 0)
  ) ?? [];
  const settlementSource = paymentEntry ?? entry;
  const settlementLine = settlementSource?.lines.find((line) =>
    line.account.vatRole !== "INPUT"
    && !["2110", "2130", "27124"].includes(line.account.code)
    && (isCreditNote ? Number(line.debit) > 0 : Number(line.credit) > 0)
  ) ?? null;
  return NextResponse.json({
    invoice: {
      ...invoice,
      invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
      paymentDate: paymentEntry?.date.toISOString().slice(0, 10) ?? null,
      claimPeriod: (invoice.claimPeriod ?? invoice.invoiceDate).toISOString().slice(0, 7),
      baseAmount: Number(invoice.baseAmount),
      vatAmount: Number(invoice.vatAmount),
      totalAmount: Number(invoice.totalAmount),
      vendorAddress: invoice.whtCertificate?.payeeAddress
        ?? invoice.partner?.branches.find((branch) => branch.branchTag === invoice.vendorBranchTag)?.address
        ?? invoice.partner?.address
        ?? "",
    },
    entry: entry ? {
      ...entry,
      date: entry.date.toISOString().slice(0, 10),
      lines: entry.lines.map((line) => ({ ...line, debit: Number(line.debit), credit: Number(line.credit) })),
    } : null,
    paymentEntry: paymentEntry ? {
      ...paymentEntry,
      date: paymentEntry.date.toISOString().slice(0, 10),
      lines: paymentEntry.lines.map((line) => ({ ...line, debit: Number(line.debit), credit: Number(line.credit) })),
    } : null,
    formOptions: { expenseAccounts, paymentAccounts, partners },
    accounting: {
      expenseLines: purchaseExpenseLines.map((line) => ({ accountId: line.accountId, amount: Math.max(Number(line.debit), Number(line.credit)) })),
      paymentDate: paymentEntry?.date.toISOString().slice(0, 10) ?? invoice.invoiceDate.toISOString().slice(0, 10),
      paymentAccountId: settlementLine?.accountId ?? "",
    },
  });
}

/** แก้ไขใบกำกับภาษีซื้อ — กฎทั้งหมดอยู่ใน purchaseInvoiceEdit.ts */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireSectionApi("ACCOUNTING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  try {
    const invoice = await updatePurchaseInvoice(params.id, body, { userId: staff.staffId });
    return NextResponse.json({ invoice });
  } catch (e) {
    if (e instanceof AccountingError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

/** ยกเลิกใบกำกับภาษีซื้อ — ไม่ลบทิ้ง เพื่อให้ตรวจย้อนหลังได้ว่าเคยบันทึกอะไรไว้ */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireSectionApi("ACCOUNTING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { action } = await req.json();
  if (action !== "void") return NextResponse.json({ error: "action ต้องเป็น void" }, { status: 400 });

  try {
    const invoice = await voidPurchaseTaxInvoice(params.id, staff.staffId);
    return NextResponse.json({ invoice });
  } catch (error) {
    if (error instanceof AccountingError) {
      const status = error.message === "ไม่พบใบกำกับภาษีซื้อนี้" ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    throw error;
  }
}
