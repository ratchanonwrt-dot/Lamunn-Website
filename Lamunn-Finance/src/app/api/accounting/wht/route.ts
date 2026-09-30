import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { parseDateOnly } from "@/lib/dates";
import { toBaht, toSatang } from "@/lib/accounting/money";
import { createEntry, AccountingError } from "@/lib/accounting/post";
import { SYSTEM_ACCOUNTS } from "@/lib/accounting/chartOfAccounts";
import { nextWhtDocNo } from "@/lib/accounting/withholding";
import { withholdingFromPercent } from "@/lib/accounting/withholdingMath";

/** บันทึกการหักภาษี ณ ที่จ่าย 1 ครั้ง (= หนังสือรับรอง 50 ทวิ 1 ใบ)
 * รวมทั้งเดือนแล้วได้เป็นแบบ ภ.ง.ด.3 (บุคคลธรรมดา) หรือ ภ.ง.ด.53 (นิติบุคคล) */
export async function POST(req: NextRequest) {
  const staff = await requireSectionApi("ACCOUNTING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    payDate, formType, partnerId, payeeName, payeeTaxId, payeeAddress, payeeBranchTag,
    incomeType, baseAmount, whtRate, note, expenseAccountId, creditAccountId,
  } = body;

  if (!payDate || !formType || !payeeName || !incomeType || !baseAmount) {
    return NextResponse.json({ error: "กรอกวันที่จ่าย แบบที่ยื่น ชื่อผู้รับเงิน ประเภทเงินได้ และจำนวนเงินให้ครบ" }, { status: 400 });
  }
  if (formType !== "PND3" && formType !== "PND53") {
    return NextResponse.json({ error: "แบบที่ยื่นต้องเป็น ภ.ง.ด.3 หรือ ภ.ง.ด.53" }, { status: 400 });
  }
  if (formType === "PND3" && !String(payeeAddress ?? "").trim()) {
    return NextResponse.json({ error: "กรอกที่อยู่ผู้ถูกหักภาษีสำหรับหนังสือรับรอง 50 ทวิ ภ.ง.ด.3" }, { status: 400 });
  }

  const base = toSatang(baseAmount);
  if (base <= 0) return NextResponse.json({ error: "จำนวนเงินต้องมากกว่า 0" }, { status: 400 });

  const rate = Number(whtRate);
  if (!Number.isFinite(rate) || rate <= 0 || rate >= 1) {
    return NextResponse.json({ error: "อัตราภาษีต้องอยู่ระหว่าง 0 ถึง 1 (เช่น 0.03 = 3%)" }, { status: 400 });
  }

  const date = parseDateOnly(payDate);
  const { amount: whtAmount } = withholdingFromPercent(base, rate * 100);

  // ลงบัญชีให้เลยถ้าเลือกบัญชีมาครบ — Dr ค่าใช้จ่าย / Cr เงินที่จ่ายจริง / Cr ภาษีหัก ณ ที่จ่ายค้างนำส่ง
  // ผูก entryId ไว้ เพื่อไม่ให้รายการเดียวกันโผล่ซ้ำในส่วน "ยังไม่ได้ออกหนังสือรับรอง"
  let entryId: string | null = null;
  if (expenseAccountId && creditAccountId) {
    const whtAccount = await prisma.accAccount.findUnique({ where: { code: SYSTEM_ACCOUNTS.WHT_PAYABLE }, select: { id: true } });
    if (!whtAccount) {
      return NextResponse.json({ error: `ไม่พบบัญชีภาษีหัก ณ ที่จ่ายค้างนำส่ง รหัส ${SYSTEM_ACCOUNTS.WHT_PAYABLE} ในผังบัญชี` }, { status: 400 });
    }
    try {
      const entry = await createEntry({
        date,
        journalType: "PAYMENT",
        description: `จ่าย ${String(payeeName).trim()} หัก ณ ที่จ่าย ${(rate * 100).toFixed(2)}%`,
        userId: staff.staffId,
        lines: [
          { accountId: expenseAccountId, debit: toBaht(base), partnerId: partnerId || null, memo: String(incomeType).trim() },
          { accountId: creditAccountId, credit: toBaht(base - whtAmount), partnerId: partnerId || null },
          { accountId: whtAccount.id, credit: toBaht(whtAmount), memo: "ภาษีหัก ณ ที่จ่าย" },
        ],
      });
      entryId = entry.id;
    } catch (e) {
      if (e instanceof AccountingError) return NextResponse.json({ error: e.message }, { status: 400 });
      throw e;
    }
  }

  const cert = await prisma.accWhtCertificate.create({
    data: {
      docNo: await nextWhtDocNo(date),
      payDate: date,
      formType,
      partnerId: partnerId || null,
      payeeName: String(payeeName).trim(),
      payeeTaxId: payeeTaxId || null,
      payeeAddress: String(payeeAddress ?? "").trim() || null,
      payeeBranchTag: payeeBranchTag || null,
      incomeType: String(incomeType).trim(),
      baseAmount: toBaht(base),
      whtRate: rate,
      whtAmount: toBaht(whtAmount),
      entryId,
      note: note || null,
      createdBy: staff.staffId,
    },
  });

  return NextResponse.json({ cert });
}
