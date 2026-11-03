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
    include: { whtCertificate: true },
  });
  if (!invoice) return NextResponse.json({ error: "ไม่พบใบกำกับภาษีซื้อนี้" }, { status: 404 });
  const entry = invoice.entryId
    ? await prisma.accJournalEntry.findUnique({ where: { id: invoice.entryId }, select: { id: true, entryNo: true, status: true } })
    : null;
  const sourcedPaymentEntry = invoice.entryId
    ? await prisma.accJournalEntry.findUnique({
        where: { sourceType_sourceKey: { sourceType: "PURCHASE_TAX_PAYMENT", sourceKey: invoice.entryId } },
        select: { id: true, entryNo: true, status: true, date: true },
      })
    : null;
  const paymentEntry = sourcedPaymentEntry ?? (
    invoice.whtCertificate?.entryId && invoice.whtCertificate.entryId !== invoice.entryId
      ? await prisma.accJournalEntry.findUnique({
          where: { id: invoice.whtCertificate.entryId },
          select: { id: true, entryNo: true, status: true, date: true },
        })
      : null
  );
  return NextResponse.json({
    invoice: {
      ...invoice,
      invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
      paymentDate: paymentEntry?.date.toISOString().slice(0, 10) ?? null,
      claimPeriod: (invoice.claimPeriod ?? invoice.invoiceDate).toISOString().slice(0, 7),
      baseAmount: Number(invoice.baseAmount),
      vatAmount: Number(invoice.vatAmount),
      totalAmount: Number(invoice.totalAmount),
    },
    entry,
    paymentEntry,
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
