import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "@lamunn/db-finance";

/** รายการอ้างอิงที่ทุกหน้าบัญชีต้องใช้ (ผังบัญชี คู่ค้า สาขา คำที่เคยพิมพ์) — แคชไว้ที่เซิร์ฟเวอร์
 *
 * ของพวกนี้แทบไม่เปลี่ยน แต่ถูกดึงจากฐานข้อมูลใหม่ทุกครั้งที่เปิดหน้าสมุดรายวัน/คีย์ใบสำคัญ/แยกประเภท
 * (คู่ค้า 500+ ราย ผังบัญชี 400+ บัญชี) กลายเป็นเวลาโหลดคงที่ที่ต้องรอก่อนเห็นหน้า
 * แคชด้วย tag แล้วล้างทันทีใน API ที่แก้ข้อมูลนั้น (ดู revalidateAccountingRef) ข้อมูลจึงไม่มีทางค้าง
 * ยกเว้นสาขาซึ่งเป็นตารางของฝั่งการเงิน — ใช้หมดอายุตามเวลาแทนเพราะไม่แตะ API ของฝั่งนั้น
 *
 * select เฉพาะฟิลด์ธรรมดา (string/boolean) เพราะ unstable_cache เก็บผลเป็น JSON — Date/Decimal จะเพี้ยน */
export const ACC_ACCOUNTS_TAG = "acc-accounts";
export const ACC_PARTNERS_TAG = "acc-partners";
export const ACC_JOURNAL_TAG = "acc-journal";

export function revalidateAccountingRef(...tags: string[]) {
  for (const t of tags) revalidateTag(t);
}

/** บัญชีที่ลงรายการได้และยังเปิดใช้ — สำหรับช่องเลือกบัญชีตอนคีย์ */
export const getPostableAccounts = unstable_cache(
  async () =>
    prisma.accAccount.findMany({
      where: { isActive: true, isPostable: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, nameTh: true, type: true, vatRole: true },
    }),
  ["acc-postable-accounts"],
  { tags: [ACC_ACCOUNTS_TAG] }
);

/** บัญชีที่ลงรายการได้ทั้งหมด (รวมที่ปิดใช้แล้ว) — หน้าแยกประเภทต้องดูย้อนหลังได้แม้บัญชีถูกปิดไป */
export const getLedgerAccounts = unstable_cache(
  async () =>
    prisma.accAccount.findMany({
      where: { isPostable: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, nameTh: true, type: true },
    }),
  ["acc-ledger-accounts"],
  { tags: [ACC_ACCOUNTS_TAG] }
);

/** คู่ค้าทุกราย (ระบุ isActive มาด้วย ให้ผู้เรียกกรองเอง) — ชุดเดียวใช้ทั้งช่องคีย์และช่องกรอง */
export const getPartnerOptions = unstable_cache(
  async () =>
    prisma.accPartner.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, phone: true, taxId: true, branchTag: true, isActive: true },
    }),
  ["acc-partner-options"],
  { tags: [ACC_PARTNERS_TAG] }
);

/** สาขาที่เปิดอยู่ — ตารางฝั่งการเงิน จึงหมดอายุตามเวลา (สาขาใหม่โผล่ในช่องเลือกช้าสุด 1 นาที) */
export const getBranchOptions = unstable_cache(
  async () => prisma.branch.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ["acc-branch-options"],
  { revalidate: 60 }
);

/** คำอธิบาย/หมายเหตุที่เคยพิมพ์ในใบสำคัญก่อนๆ — เป็นตัวเลือกให้เลือกซ้ำตอนคีย์
 * ล้างเมื่อมีใบสำคัญคีย์มือใหม่ (tag) และหมดอายุเองทุก 5 นาทีเผื่อใบที่ระบบสร้างให้ */
export const getEntrySuggestions = unstable_cache(
  async () => {
    const [recentEntries, recentMemos] = await Promise.all([
      prisma.accJournalEntry.findMany({ orderBy: { createdAt: "desc" }, take: 200, select: { description: true } }),
      prisma.accJournalLine.findMany({
        where: { memo: { not: null } },
        orderBy: { entry: { createdAt: "desc" } },
        take: 300,
        select: { memo: true },
      }),
    ]);
    return {
      descriptions: Array.from(new Set(recentEntries.map((e) => e.description.trim()).filter(Boolean))).slice(0, 50),
      memos: Array.from(new Set(recentMemos.map((m) => (m.memo ?? "").trim()).filter(Boolean))).slice(0, 50),
    };
  },
  ["acc-entry-suggestions"],
  { tags: [ACC_JOURNAL_TAG], revalidate: 300 }
);
