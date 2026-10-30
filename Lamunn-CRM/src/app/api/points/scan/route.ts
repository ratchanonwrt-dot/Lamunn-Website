import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@lamunn/db";
import { verifyQrPayload } from "@lamunn/db";
import { resolvePointRule, calculatePoints } from "@lamunn/db";
import { computeExpiryDate } from "@lamunn/db";
import { lookupPosBill } from "@lamunn/db";
import { grantWelcomeCouponIfNeeded } from "@lamunn/db";

// No login required: the customer just scans the receipt QR and types their phone
// number. Low friction by design — see prisma/schema.prisma / project plan for the
// accepted trade-off (anyone holding the physical receipt QR could credit points to
// a phone number that isn't theirs; low risk since only points, not money, are at stake).
const schema = z.object({
  qr: z.string().min(1),
  phone: z.string().min(1),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  dateOfBirth: z.string().min(1).optional(), // ISO date string, e.g. "1998-04-12"
  gender: z.enum(["FEMALE", "MALE", "LGBTQ", "UNSPECIFIED"]).optional(),
  consented: z.literal(true).optional(),
  tosConsented: z.literal(true).optional(),
});

const POS_QR_SECRET = process.env.POS_QR_SECRET ?? "";
const QR_VALID_HOURS = Number(process.env.QR_VALID_HOURS ?? 72);
const MAX_UNSIGNED_AUTO_POINTS_AMOUNT = Number(process.env.MAX_UNSIGNED_AUTO_POINTS_AMOUNT ?? 0);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง", code: "MALFORMED" }, { status: 400 });
  }
  const { qr, phone, firstName, lastName, dateOfBirth, gender, consented, tosConsented } = parsed.data;

  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined;
  const userAgent = req.headers.get("user-agent") ?? undefined;

  const verification = verifyQrPayload(qr, { secret: POS_QR_SECRET, validHours: QR_VALID_HOURS });

  // Any malformed QR: nothing structured enough to log against a branch.
  if (!verification.payload) {
    await prisma.qrScanLog.create({
      data: { rawPayload: qr, signatureValid: false, result: "ERROR", ip, userAgent },
    });
    return NextResponse.json({ error: "ไม่สามารถอ่านข้อมูลจาก QR นี้ได้", code: "MALFORMED" }, { status: 400 });
  }

  const { branchCode, receiptNo, amount } = verification.payload;

  const logBase = { rawPayload: qr, branchCode, receiptNo, amount, ip, userAgent };

  if (!verification.ok) {
    const resultMap = {
      MALFORMED: "ERROR",
      INVALID_SIGNATURE: "INVALID_SIGNATURE",
      EXPIRED: "EXPIRED",
    } as const;
    await prisma.qrScanLog.create({
      data: { ...logBase, signatureValid: false, result: resultMap[verification.reason] },
    });
    const messages = {
      MALFORMED: "ไม่สามารถอ่านข้อมูลจาก QR นี้ได้",
      INVALID_SIGNATURE: "QR นี้ไม่ผ่านการตรวจสอบความถูกต้อง กรุณาติดต่อพนักงาน",
      EXPIRED: "QR นี้หมดอายุแล้ว กรุณาติดต่อพนักงานหน้าร้าน",
    };
    return NextResponse.json({ error: messages[verification.reason], code: verification.reason }, { status: 400 });
  }

  const { signed } = verification;

  // Unsigned QR risk policy: cap the auto-approved amount until the POS signs QR codes.
  if (!signed && amount > MAX_UNSIGNED_AUTO_POINTS_AMOUNT) {
    await prisma.qrScanLog.create({ data: { ...logBase, signatureValid: false, result: "INVALID_SIGNATURE" } });
    return NextResponse.json(
      { error: "ยอดสูงเกินกว่าที่ระบบจะสะสมแต้มอัตโนมัติได้ กรุณาติดต่อพนักงานหน้าร้าน", code: "NEEDS_MANUAL_REVIEW" },
      { status: 400 }
    );
  }

  const branch = await prisma.branch.findUnique({ where: { code: branchCode } });
  if (!branch || !branch.isActive) {
    await prisma.qrScanLog.create({ data: { ...logBase, signatureValid: signed, result: "INVALID_BRANCH" } });
    return NextResponse.json({ error: "ไม่พบสาขานี้ในระบบ", code: "INVALID_BRANCH" }, { status: 400 });
  }

  // Cross-check against the POS's own bill record — catches the case where a receipt
  // was printed (and QR signed) but the sale was voided in the POS before the customer
  // got to scan it. A void that happens *after* a successful scan is caught separately
  // by the periodic reconcileVoidedBills() job, since it can't be known at scan time.
  // Fails open on lookup errors (infra hiccup) so a POS-side outage doesn't block every
  // legitimate customer — only an explicit "void" status or a missing bill blocks the scan.
  try {
    const bill = await lookupPosBill(branchCode, receiptNo);
    if (bill?.status === "void") {
      await prisma.qrScanLog.create({ data: { ...logBase, branchId: branch.id, signatureValid: signed, result: "BILL_VOIDED" } });
      return NextResponse.json({ error: "ใบเสร็จนี้ถูกยกเลิกในระบบร้านแล้ว ไม่สามารถสะสมแต้มได้", code: "BILL_VOIDED" }, { status: 400 });
    }
    if (!bill) {
      await prisma.qrScanLog.create({ data: { ...logBase, branchId: branch.id, signatureValid: signed, result: "BILL_NOT_FOUND" } });
      return NextResponse.json({ error: "ไม่พบข้อมูลใบเสร็จนี้ในระบบร้าน กรุณาติดต่อพนักงาน", code: "BILL_NOT_FOUND" }, { status: 400 });
    }
  } catch (e) {
    console.error("lookupPosBill failed, allowing scan to proceed:", e);
  }

  // Duplicate check up front so we don't ask for a name/DOB unnecessarily on a
  // receipt that's already been claimed.
  const existingTx = await prisma.pointTransaction.findUnique({
    where: { branchId_receiptNo: { branchId: branch.id, receiptNo } },
  });
  if (existingTx) {
    await prisma.qrScanLog.create({ data: { ...logBase, branchId: branch.id, signatureValid: signed, result: "DUPLICATE" } });
    return NextResponse.json({ error: "ใบเสร็จนี้ถูกใช้สะสมแต้มไปแล้ว", code: "DUPLICATE" }, { status: 409 });
  }

  // Resolve the customer by phone — this is the "login-free" identification step.
  let customer = await prisma.customer.findUnique({ where: { phone } });
  if (!customer) {
    if (!firstName || !lastName || !dateOfBirth || !consented || !tosConsented) {
      // New phone number: ask the frontend to collect name + date of birth + consent first
      // (this doubles as this customer's sign-up), then resubmit.
      return NextResponse.json({ error: "ลูกค้าใหม่ กรุณากรอกชื่อและวันเกิด", code: "NEEDS_PROFILE" }, { status: 400 });
    }
    const parsedDob = new Date(dateOfBirth);
    if (Number.isNaN(parsedDob.getTime())) {
      return NextResponse.json({ error: "วันเกิดไม่ถูกต้อง", code: "MALFORMED" }, { status: 400 });
    }
    customer = await prisma.customer.create({
      data: { phone, firstName, lastName, dateOfBirth: parsedDob, dateOfBirthConfirmedAt: new Date(), gender, pdpaConsentedAt: new Date(), tosConsentedAt: new Date() },
    });
    await grantWelcomeCouponIfNeeded(customer.id);
  }
  const customerId = customer.id;

  const rule = await resolvePointRule(branch.id);
  const points = rule ? calculatePoints(amount, rule) : 0;

  if (points <= 0) {
    await prisma.qrScanLog.create({ data: { ...logBase, branchId: branch.id, customerId, signatureValid: signed, result: "SUCCESS" } });
    // Say the actual minimum and this receipt's amount — a bare "ไม่ถึงเกณฑ์" read as
    // "scanning is broken" to customers buying a ฿89 item.
    const minBaht = rule ? Math.max(Number(rule.minAmount), Number(rule.bahtPerPoint)) : null;
    const baht = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
    const error = minBaht
      ? `ซื้อครบ ${baht(minBaht)} บาทขึ้นไปต่อใบเสร็จ จึงจะสะสมแต้มได้ (ใบเสร็จนี้ ${baht(amount)} บาท)`
      : "สาขานี้ยังไม่เปิดสะสมแต้ม กรุณาติดต่อพนักงาน";
    return NextResponse.json({ error, code: "BELOW_THRESHOLD" }, { status: 400 });
  }

  const [, updatedCustomer] = await prisma.$transaction([
    prisma.pointTransaction.create({
      data: { customerId, branchId: branch.id, type: "EARN", points, amount, receiptNo, qrRawPayload: qr, expiresAt: computeExpiryDate() },
    }),
    prisma.customer.update({ where: { id: customerId }, data: { pointsBalance: { increment: points }, lifetimePoints: { increment: points } } }),
    prisma.qrScanLog.create({ data: { ...logBase, branchId: branch.id, customerId, signatureValid: signed, result: "SUCCESS" } }),
  ]);

  return NextResponse.json({
    ok: true,
    pointsEarned: points,
    newBalance: updatedCustomer.pointsBalance,
    branchName: branch.name,
    signed,
  });
}
