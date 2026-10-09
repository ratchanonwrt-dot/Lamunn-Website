import { prisma } from "@lamunn/db-finance";
import type { AccEntryStatus, AccJournalType, Prisma } from "@lamunn/db-finance";
import { toBaht, toSatang } from "./money";
import { recordAutokeyLearning } from "./autokey";

/** เครื่องมือกลางสำหรับสร้าง/ผ่านรายการใบสำคัญ
 *
 * ทุกทางที่ทำให้เกิดรายการบัญชี (คีย์มือ, ลงยอดขายรายวัน, ใบกำกับภาษี, ค่าเช่า)
 * ต้องผ่านไฟล์นี้เท่านั้น เพื่อให้กฎสองข้อนี้บังคับใช้ที่เดียว:
 *   1. sum(debit) = sum(credit) เสมอ
 *   2. งวดที่ปิดแล้วบันทึกเพิ่ม/แก้ไม่ได้
 */

export class AccountingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountingError";
  }
}

export interface DraftLine {
  accountId: string;
  debit?: number; // บาท
  credit?: number; // บาท
  branchId?: string | null;
  channel?: string | null;
  partnerId?: string | null; // จ่ายให้ใคร/ค้างรับจากใคร — ดู AccPartner
  memo?: string | null;
  docNo?: string | null; // เลขที่ใบกำกับ/เอกสารอ้างอิงของบรรทัด (ดู schema)
}

export interface DraftEntry {
  date: Date;
  journalType?: AccJournalType;
  description: string;
  sourceType?: string | null;
  sourceKey?: string | null;
  status?: AccEntryStatus; // ค่าเริ่มต้น DRAFT — รายการอัตโนมัติควรเป็นร่างเสมอ ให้คนกดอนุมัติ
  lines: DraftLine[];
  userId?: string | null;
}

const PREFIX: Record<AccJournalType, string> = {
  GENERAL: "JV",
  SALES: "SV",
  PURCHASE: "PV",
  RECEIPT: "RV",
  PAYMENT: "PY",
  ADJUST: "AJ",
  CLOSING: "CL",
};

/** ตรวจว่าใบสำคัญสมดุลและกรอกถูกต้อง — คืนยอดรวมเป็นสตางค์ */
export function validateLines(lines: DraftLine[]): { debit: number; credit: number } {
  const clean = lines.filter((l) => l.accountId && (toSatang(l.debit) !== 0 || toSatang(l.credit) !== 0));
  if (clean.length < 2) {
    throw new AccountingError("ใบสำคัญต้องมีอย่างน้อย 2 บรรทัดที่มียอด");
  }

  let debit = 0;
  let credit = 0;
  for (const l of clean) {
    const d = toSatang(l.debit);
    const c = toSatang(l.credit);
    if (d < 0 || c < 0) throw new AccountingError("ยอดเดบิต/เครดิตติดลบไม่ได้ — ถ้าจะกลับรายการให้สลับข้างแทน");
    if (d > 0 && c > 0) throw new AccountingError("บรรทัดเดียวกันใส่ทั้งเดบิตและเครดิตไม่ได้");
    debit += d;
    credit += c;
  }

  if (debit !== credit) {
    const diff = toBaht(Math.abs(debit - credit)).toLocaleString("th-TH", { minimumFractionDigits: 2 });
    throw new AccountingError(`เดบิตกับเครดิตไม่เท่ากัน ต่างกัน ${diff} บาท — แก้ให้ลงตัวก่อนจึงจะบันทึกได้`);
  }
  if (debit === 0) throw new AccountingError("ยอดรวมเป็นศูนย์ บันทึกไม่ได้");

  return { debit, credit };
}

/** สร้างงวดบัญชีถ้ายังไม่มี แล้วคืนสถานะของงวดนั้น */
export async function ensurePeriod(date: Date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const existing = await prisma.accPeriod.findUnique({ where: { year_month: { year, month } } });
  if (existing) return existing;
  return prisma.accPeriod.create({ data: { year, month } });
}

/** ปฏิเสธการบันทึกถ้างวดนั้นปิดไปแล้ว */
export async function assertPeriodOpen(date: Date) {
  const period = await ensurePeriod(date);
  if (period.status === "CLOSED") {
    throw new AccountingError(
      `งวด ${period.month}/${period.year + 543} ปิดบัญชีแล้ว บันทึกย้อนหลังไม่ได้ — ถ้าต้องแก้ ให้ออกใบสำคัญปรับปรุงในงวดที่ยังเปิดอยู่แทน`
    );
  }
  return period;
}

/** เลขที่ใบสำคัญรันต่อเนื่องต่อประเภทต่อเดือน เช่น JV-6808-0031 (ปี พ.ศ. 2 หลัก + เดือน) */
async function nextEntryNo(tx: Prisma.TransactionClient, journalType: AccJournalType, date: Date): Promise<string> {
  const be = (date.getUTCFullYear() + 543) % 100;
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const prefix = `${PREFIX[journalType]}-${String(be).padStart(2, "0")}${mm}-`;

  const last = await tx.accJournalEntry.findFirst({
    where: { entryNo: { startsWith: prefix } },
    orderBy: { entryNo: "desc" },
    select: { entryNo: true },
  });

  const seq = last ? Number(last.entryNo.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

/** สร้างใบสำคัญพร้อมบรรทัดรายการ — ตรวจสมดุลและงวดบัญชีให้เรียบร้อยก่อนเสมอ
 *
 * ถ้าส่ง sourceType/sourceKey มา แล้วมีใบของต้นทางเดียวกันอยู่แล้ว จะคืนใบเดิม
 * (กันลงซ้ำเวลากดปุ่มลงบัญชียอดขายรายวันเดิมสองครั้ง) */
export async function createEntry(draft: DraftEntry) {
  const lines = draft.lines.filter((l) => l.accountId && (toSatang(l.debit) !== 0 || toSatang(l.credit) !== 0));
  validateLines(lines);
  await assertPeriodOpen(draft.date);

  const journalType = draft.journalType ?? "GENERAL";
  const status = draft.status ?? "DRAFT";

  return prisma.$transaction(async (tx) => {
    if (draft.sourceType && draft.sourceKey) {
      const existing = await tx.accJournalEntry.findUnique({
        where: { sourceType_sourceKey: { sourceType: draft.sourceType, sourceKey: draft.sourceKey } },
      });
      if (existing) return existing;
    }

    const entryNo = await nextEntryNo(tx, journalType, draft.date);
    return tx.accJournalEntry.create({
      data: {
        entryNo,
        date: draft.date,
        journalType,
        status,
        description: draft.description,
        sourceType: draft.sourceType ?? null,
        sourceKey: draft.sourceKey ?? null,
        createdBy: draft.userId ?? null,
        postedAt: status === "POSTED" ? new Date() : null,
        postedBy: status === "POSTED" ? draft.userId ?? null : null,
        lines: {
          // date/status ถูกคัดลอกลงทุกบรรทัดด้วย — เป็นค่าซ้ำโดยตั้งใจเพื่อให้คิวรีออกงบไม่ต้อง join
          // (ดูเหตุผลเต็มในคอมเมนต์ของ AccJournalLine ใน schema.prisma)
          create: lines.map((l, i) => ({
            accountId: l.accountId,
            debit: toBaht(toSatang(l.debit)),
            credit: toBaht(toSatang(l.credit)),
            branchId: l.branchId ?? null,
            channel: l.channel ?? null,
            partnerId: l.partnerId ?? null,
            memo: l.memo ?? null,
            docNo: l.docNo ?? null,
            sortOrder: i,
            date: draft.date,
            status,
          })),
        },
      },
    });
  });
}

/** แก้ไขใบสำคัญที่ยังเป็นร่าง — ลบบรรทัดเดิมทิ้งแล้วสร้างใหม่ทั้งหมด (ง่ายกว่า diff ทีละบรรทัด
 * และปลอดภัยเพราะร่างยังไม่เข้างบ ไม่มีอะไรอ้างอิงบรรทัดเดิมอยู่)
 * แก้ได้เฉพาะร่างเท่านั้น — ใบที่ผ่านรายการแล้วต้องยกเลิกแล้วคีย์ใหม่ กันงบย้อนหลังเพี้ยน */
export async function updateEntry(entryId: string, draft: Omit<DraftEntry, "sourceType" | "sourceKey" | "userId">) {
  const existing = await prisma.accJournalEntry.findUnique({ where: { id: entryId } });
  if (!existing) throw new AccountingError("ไม่พบใบสำคัญนี้");
  if (existing.status !== "DRAFT") {
    throw new AccountingError("แก้ไขได้เฉพาะใบสำคัญที่ยังเป็นร่าง — ใบที่ผ่านรายการแล้วให้ยกเลิกแล้วคีย์ใหม่แทน");
  }

  const lines = draft.lines.filter((l) => l.accountId && (toSatang(l.debit) !== 0 || toSatang(l.credit) !== 0));
  validateLines(lines);
  await assertPeriodOpen(draft.date);

  const journalType = draft.journalType ?? existing.journalType;

  return prisma.$transaction(async (tx) => {
    await tx.accJournalLine.deleteMany({ where: { entryId } });
    return tx.accJournalEntry.update({
      where: { id: entryId },
      data: {
        date: draft.date,
        journalType,
        description: draft.description,
        lines: {
          create: lines.map((l, i) => ({
            accountId: l.accountId,
            debit: toBaht(toSatang(l.debit)),
            credit: toBaht(toSatang(l.credit)),
            branchId: l.branchId ?? null,
            channel: l.channel ?? null,
            partnerId: l.partnerId ?? null,
            memo: l.memo ?? null,
            docNo: l.docNo ?? null,
            sortOrder: i,
            date: draft.date,
            status: "DRAFT",
          })),
        },
      },
      include: { lines: true },
    });
  });
}

/** ผ่านรายการใบสำคัญร่างเข้าบัญชีแยกประเภท (หลังจากนี้จะเข้างบทดลอง/งบการเงิน) */
export async function postEntry(entryId: string, userId?: string | null) {
  const entry = await prisma.accJournalEntry.findUnique({ where: { id: entryId }, include: { lines: true } });
  if (!entry) throw new AccountingError("ไม่พบใบสำคัญนี้");
  if (entry.status === "POSTED") return entry;
  if (entry.status === "VOID") throw new AccountingError("ใบสำคัญนี้ถูกยกเลิกไปแล้ว ผ่านรายการไม่ได้");

  validateLines(entry.lines.map((l) => ({ accountId: l.accountId, debit: Number(l.debit), credit: Number(l.credit) })));
  await assertPeriodOpen(entry.date);

  // อัปเดตสถานะที่บรรทัดด้วยเสมอ ไม่งั้นงบจะไม่เห็นรายการนี้ (คิวรีงบอ่านสถานะจากบรรทัด)
  const [updated] = await prisma.$transaction([
    prisma.accJournalEntry.update({
      where: { id: entryId },
      data: { status: "POSTED", postedAt: new Date(), postedBy: userId ?? null },
    }),
    prisma.accJournalLine.updateMany({ where: { entryId }, data: { status: "POSTED" } }),
  ]);
  // เรียนรู้หลังผ่านรายการเท่านั้น ร่างที่ยังไม่ตรวจหรือถูกยกเลิกจึงไม่มีทางทำให้กฎบัญชีเพี้ยน
  if (entry.sourceType === "AI_AUTOKEY") await recordAutokeyLearning(entryId);
  return updated;
}

/** ถอนการผ่านรายการ — ดึงใบสำคัญกลับมาเป็นร่างเพื่อแก้ไข
 *
 * ต่างจาก "ยกเลิก" (voidEntry) ตรงที่ใบยังใช้งานได้ต่อ แค่ออกจากงบชั่วคราวระหว่างแก้
 * แก้เสร็จแล้วกดผ่านรายการใหม่ ยอดก็กลับเข้างบเหมือนเดิม
 * ทำได้เฉพาะงวดที่ยังไม่ปิด — ถ้าปิดงวดไปแล้วต้องออกใบสำคัญปรับปรุงแทน */
export async function unpostEntry(entryId: string, userId?: string | null) {
  const entry = await prisma.accJournalEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new AccountingError("ไม่พบใบสำคัญนี้");
  if (entry.status === "DRAFT") return entry;
  if (entry.status === "VOID") {
    throw new AccountingError("ใบสำคัญนี้ถูกยกเลิกไปแล้ว ถอนการผ่านรายการไม่ได้");
  }
  await assertPeriodOpen(entry.date);

  // ต้องอัปเดตสถานะที่บรรทัดด้วย เพราะคิวรีงบ/รายงานภาษีอ่านสถานะจากบรรทัด (ดู schema.prisma)
  const [updated] = await prisma.$transaction([
    prisma.accJournalEntry.update({
      where: { id: entryId },
      data: { status: "DRAFT", postedAt: null, postedBy: null, createdBy: userId ?? entry.createdBy },
    }),
    prisma.accJournalLine.updateMany({ where: { entryId }, data: { status: "DRAFT" } }),
  ]);
  return updated;
}

/** เรียกคืนใบสำคัญที่ยกเลิกไปแล้ว — กลับมาเป็น "ร่าง" เสมอ ไม่ใช่สถานะเดิม
 *
 * ตอนยกเลิกเราไม่ได้จำว่าใบนั้นเคยผ่านรายการหรือยัง และการเรียกคืนมักเกิดจากกดยกเลิกผิดใบ
 * ให้กลับมาเป็นร่างแล้วให้คนตรวจดูอีกรอบก่อนกดผ่านรายการเอง ปลอดภัยกว่ายัดเข้างบทันที
 * ทำได้เฉพาะงวดที่ยังไม่ปิด */
export async function restoreEntry(entryId: string, userId?: string | null) {
  const entry = await prisma.accJournalEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new AccountingError("ไม่พบใบสำคัญนี้");
  if (entry.status !== "VOID") return entry;
  await assertPeriodOpen(entry.date);

  const [updated] = await prisma.$transaction([
    prisma.accJournalEntry.update({
      where: { id: entryId },
      data: { status: "DRAFT", postedAt: null, postedBy: null, createdBy: userId ?? entry.createdBy },
    }),
    prisma.accJournalLine.updateMany({ where: { entryId }, data: { status: "DRAFT" } }),
  ]);
  return updated;
}

/** ยกเลิกใบสำคัญ — ใบที่ผ่านรายการแล้วยกเลิกได้เฉพาะเมื่องวดยังไม่ปิด */
export async function voidEntry(entryId: string, userId?: string | null) {
  const entry = await prisma.accJournalEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new AccountingError("ไม่พบใบสำคัญนี้");
  await assertPeriodOpen(entry.date);
  const [updated] = await prisma.$transaction([
    prisma.accJournalEntry.update({
      where: { id: entryId },
      data: { status: "VOID", postedBy: userId ?? entry.postedBy },
    }),
    prisma.accJournalLine.updateMany({ where: { entryId }, data: { status: "VOID" } }),
  ]);
  return updated;
}
