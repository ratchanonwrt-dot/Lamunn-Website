import { Prisma } from ".prisma/client-finance";
import { prisma } from "./client";
import { runWithConcurrency } from "./batch";

// Read-only bridge into the friend's POS Supabase tables (public.branches / public.pos_bills),
// living in the same Postgres project as this app's own "lamunn_finance" schema.
export interface PosDailyTotal {
  posCode: string;
  date: string; // yyyy-mm-dd
  storeCash: number;
  storeTransfer: number;
  grab: number;
  lineman: number;
  shopee: number;
  total: number;
  billCount: number;
}

const CASH_METHODS = new Set(["cash", "เงินสด"]);

function toRows(raw: { pos_code: string; bill_date: string; channel: string; payment_method: string | null; total: unknown }[]) {
  return raw.map((r) => ({ ...r, total: Number(r.total) }));
}

/**
 * Pulls non-voided POS bills for the given date range, grouped by (posCode, date).
 * Only branches that have a posCode set are matched — branches not yet on the
 * friend's POS return no rows and are left for manual entry as before.
 */
export async function getPosDailyTotals(start: Date, end: Date): Promise<Map<string, PosDailyTotal>> {
  const raw = await prisma.$queryRaw<{ pos_code: string; bill_date: string; channel: string; payment_method: string | null; total: unknown }[]>`
    SELECT b.code AS pos_code, pb.bill_date::text AS bill_date, pb.channel, pb.payment_method, pb.total
    FROM public.pos_bills pb
    JOIN public.branches b ON b.id = pb.branch_id
    WHERE pb.status <> 'void' AND pb.bill_date >= ${start}::date AND pb.bill_date <= ${end}::date
  `;

  const map = new Map<string, PosDailyTotal>();
  for (const row of toRows(raw)) {
    const key = `${row.pos_code}_${row.bill_date}`;
    const existing = map.get(key) ?? {
      posCode: row.pos_code,
      date: row.bill_date,
      storeCash: 0,
      storeTransfer: 0,
      grab: 0,
      lineman: 0,
      shopee: 0,
      total: 0,
      billCount: 0,
    };
    if (row.channel === "grab") existing.grab += row.total;
    else if (row.channel === "lineman") existing.lineman += row.total;
    else if (row.channel === "shopee") existing.shopee += row.total;
    else if (CASH_METHODS.has(row.payment_method ?? "")) existing.storeCash += row.total;
    else existing.storeTransfer += row.total;
    existing.total += row.total;
    existing.billCount += 1;
    map.set(key, existing);
  }
  return map;
}

export async function getPosDailyTotal(posCode: string, date: Date): Promise<PosDailyTotal | null> {
  const map = await getPosDailyTotals(date, date);
  return map.get(`${posCode}_${date.toISOString().slice(0, 10)}`) ?? null;
}

// --- Branch daily sales auto-fill (public.branch_sales_reports) ---
// This is the *master data* source for branch-level storefront/Grab/Lineman figures —
// staff-submitted daily reports in the friend's IMS system, NOT the raw pos_bills table
// above (that one stays reserved for the live POS reconciliation cross-check feature).
export interface BranchSalesReport {
  posCode: string;
  date: string; // yyyy-mm-dd
  cash: number;
  transfer: number;
  grab: number;
  lineman: number;
  shopee: number;
  posTotal: number;
}

export async function getBranchSalesReports(start: Date, end: Date): Promise<Map<string, BranchSalesReport>> {
  const raw = await prisma.$queryRaw<
    { pos_code: string; report_date: string; cash_amount: unknown; transfer_amount: unknown; grab_amount: unknown; lineman_amount: unknown; shopee_amount: unknown; pos_total_amount: unknown }[]
  >`
    SELECT b.code AS pos_code, bsr.report_date::text AS report_date, bsr.cash_amount, bsr.transfer_amount, bsr.grab_amount, bsr.lineman_amount, bsr.shopee_amount, bsr.pos_total_amount
    FROM public.branch_sales_reports bsr
    JOIN public.branches b ON b.id = bsr.branch_id
    WHERE bsr.report_date >= ${start}::date AND bsr.report_date <= ${end}::date
  `;

  const map = new Map<string, BranchSalesReport>();
  for (const row of raw) {
    map.set(`${row.pos_code}_${row.report_date}`, {
      posCode: row.pos_code,
      date: row.report_date,
      cash: Number(row.cash_amount ?? 0),
      transfer: Number(row.transfer_amount ?? 0),
      grab: Number(row.grab_amount ?? 0),
      lineman: Number(row.lineman_amount ?? 0),
      shopee: Number(row.shopee_amount ?? 0),
      posTotal: Number(row.pos_total_amount ?? 0),
    });
  }
  return map;
}

// From this date on, the friend's IMS staff-submitted reports are the master record for
// branches linked via posCode — this app only ever reads them and fills its own DailySales
// row to match, never writes back to the source side.
export const POS_SYNC_START_DATE = new Date(Date.UTC(2026, 6, 24));

/**
 * Pulls branch_sales_reports for a whole date range in one pass and upserts DailySales —
 * cheaper than looping day-by-day. Used to opportunistically catch up whichever month/range
 * a page is showing, so viewing the Dashboard or the monthly overview is enough to pull in
 * anything new without needing a separate scheduled job.
 */
type ExistingSalesRow = {
  storefrontOverride: boolean;
  grabOverride: boolean;
  linemanOverride: boolean;
  shopeeOverride: boolean;
  cashCountedOverride: boolean;
  cashPos: number | null;
  transfer: number | null;
  cashTransferCombined: number | null;
  cashCounted: number | null;
  grab: number;
  lineman: number;
  shopee: number;
};

// Builds the storefront/grab/lineman/cashCounted fields to write, skipping any that the
// branch's existing row has flagged as manually overridden (staff typed a value that should
// win over the auto-sync), AND skipping any that already match the stored value (so an
// unchanged day costs zero writes on repeat page loads — this is what keeps Dashboard/Monthly
// fast once everything's already in sync). `existing` is null for a brand-new row.
function buildSyncedData(
  branchType: "CASH" | "CREDIT_TERM",
  report: { cash: number; transfer: number; grab: number; lineman: number; shopee: number },
  existing?: ExistingSalesRow | null
) {
  const data: Record<string, number> = {};
  if (!existing?.storefrontOverride) {
    if (branchType === "CASH") {
      if (existing?.cashPos !== report.cash) data.cashPos = report.cash;
      if (existing?.transfer !== report.transfer) data.transfer = report.transfer;
    } else {
      const combined = report.cash + report.transfer;
      if (existing?.cashTransferCombined !== combined) data.cashTransferCombined = combined;
    }
  }
  if (!existing?.grabOverride && existing?.grab !== report.grab) data.grab = report.grab;
  if (!existing?.linemanOverride && existing?.lineman !== report.lineman) data.lineman = report.lineman;
  if (!existing?.shopeeOverride && existing?.shopee !== report.shopee) data.shopee = report.shopee;
  // "เงินสดนับ (ส่งกลับครัวกลาง)" ไม่มีฟิลด์แยกในระบบ IMS ของเพื่อน — ใช้ยอดเงินสด POS (cash_amount)
  // เป็นค่าตั้งต้นแทน (เฉพาะสาขาเงินสด, ไม่ใช่ Credit Term) เจ้าหน้าที่แก้ไขทับเองได้ตามปกติถ้ายอดจริงต่างจากนี้
  if (branchType === "CASH" && !existing?.cashCountedOverride && existing?.cashCounted !== report.cash) {
    data.cashCounted = report.cash;
  }
  return data;
}

/** สิ่งที่ sync ทำกับ "สาขา" เอง (นอกเหนือจากยอดขาย) — เอาไปแสดง/บันทึกประวัติฝั่งแอป */
export interface PosBranchEvent {
  kind: "created" | "linked" | "reactivated";
  posCode: string;
  name: string;
}

export interface PosSyncResult {
  changed: number; // จำนวนวัน-สาขาที่ยอดถูกเขียนใหม่
  branchEvents: PosBranchEvent[];
}

// รหัส POS ที่ไม่ใช่สาขาจริง (ออเดอร์พิเศษ) — ห้ามสร้างเป็นสาขาอัตโนมัติแม้จะมีรายงานยอด
const NON_BRANCH_POS_CODE = /^SPECIAL/i;
// สาขาที่ปิดไปแล้ว ถ้ามีรายงานยอดใหม่ (ไม่ใช่ศูนย์) ภายในกี่วันล่าสุด ให้เปิดกลับอัตโนมัติ — กันรายงานเก่าค้าง
// ในระบบ IMS (เช่น รายงานซ้ำที่รอลบ) ทำให้สาขาที่ปิดจริงเด้งกลับมาเปิด
const REACTIVATE_WINDOW_DAYS = 7;

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[\s_\-.()]/g, "");
}

function reportTotal(r: BranchSalesReport) {
  return r.cash + r.transfer + r.grab + r.lineman + r.shopee;
}

type BranchLite = { id: string; code: string; name: string; posCode: string | null; isActive: boolean; sortOrder: number };

/** ทำให้ทุกสาขาใน POS/IMS ที่ "มียอดขาย" มีสาขาคู่กันใน Finance โดยอัตโนมัติ
 *
 * เดิมสาขาใหม่ต้องมาเพิ่มในหน้า "ตั้งค่าสาขา" แล้วกรอกรหัส POS เอง ไม่งั้นยอดที่พนักงานส่งใน IMS จะไม่ถูกดึงมาเลย
 * (เจอจริง: Nirvana Porch เปิดขายแล้ว แต่ Finance ยังไม่รู้จัก) ตอนนี้ตอน sync ถ้าเจอรหัส POS ที่มีรายงานยอด
 * (ยอดไม่เป็นศูนย์) แต่ยังไม่ผูกกับสาขาไหน จะ:
 *   1. ถ้ามีสาขาใน Finance ชื่อเดียวกัน (เทียบแบบไม่สนตัวพิมพ์/ช่องว่าง) ที่ยังไม่ผูก POS → ผูกให้ + เปิดใช้งาน
 *   2. ไม่งั้นสร้างสาขาใหม่: รหัสถัดไป, ชื่อตาม POS, ประเภท "เงินสด" ไว้ก่อน (ส่วนใหญ่เป็นเงินสด — ถ้าเป็น Credit Term
 *      ต้องไปเปลี่ยนที่ตั้งค่าสาขา ค่าเช่า/GP ตั้งเป็น 0 รอกรอก)
 * และสาขาที่ปิดไปแล้วแต่ POS ส่งยอดใหม่เข้ามาใน REACTIVATE_WINDOW_DAYS วัน → เปิดกลับ ("มียอดแปลว่าเปิดแล้ว")
 * คืนรายการที่ทำไป ให้ฝั่งแอปบันทึกประวัติ/แจ้งผู้ใช้ */
async function autoLinkPosBranches(branches: BranchLite[], reports: Map<string, BranchSalesReport>, end: Date): Promise<PosBranchEvent[]> {
  const events: PosBranchEvent[] = [];
  const byPosCode = new Map(branches.filter((b) => b.posCode).map((b) => [b.posCode as string, b]));
  const reactivateFrom = new Date(end.getTime() - REACTIVATE_WINDOW_DAYS * 86400000);

  // รหัส POS ที่มีรายงานยอดไม่เป็นศูนย์ในช่วง แยกเป็น "ยังไม่ผูก" กับ "ผูกแล้วแต่สาขาปิดอยู่"
  const unlinked = new Set<string>();
  const reactivate = new Map<string, BranchLite>();
  for (const r of reports.values()) {
    if (reportTotal(r) <= 0) continue;
    const linked = byPosCode.get(r.posCode);
    if (!linked) {
      if (!NON_BRANCH_POS_CODE.test(r.posCode)) unlinked.add(r.posCode);
    } else if (!linked.isActive && new Date(`${r.date}T00:00:00.000Z`) >= reactivateFrom) {
      reactivate.set(linked.id, linked);
    }
  }

  for (const b of reactivate.values()) {
    await prisma.branch.update({ where: { id: b.id }, data: { isActive: true } });
    events.push({ kind: "reactivated", posCode: b.posCode as string, name: b.name });
  }

  if (unlinked.size === 0) return events;

  const posBranches = await prisma.$queryRaw<{ code: string; name: string }[]>`
    SELECT code, name FROM public.branches WHERE code IN (${Prisma.join([...unlinked])})
  `;
  let nextCode = Math.max(0, ...branches.map((b) => Number(b.code)).filter((n) => Number.isFinite(n)));
  let nextSort = Math.max(0, ...branches.map((b) => b.sortOrder));
  const linkedIds = new Set(branches.filter((b) => b.posCode).map((b) => b.id));

  for (const pos of posBranches) {
    const sameName = branches.find((b) => !linkedIds.has(b.id) && normalizeName(b.name) === normalizeName(pos.name));
    if (sameName) {
      await prisma.branch.update({ where: { id: sameName.id }, data: { posCode: pos.code, isActive: true } });
      linkedIds.add(sameName.id);
      events.push({ kind: "linked", posCode: pos.code, name: sameName.name });
      continue;
    }
    nextCode += 1;
    nextSort += 1;
    const created = await prisma.branch.create({
      data: {
        code: String(nextCode).padStart(2, "0"),
        name: pos.name,
        type: "CASH",
        sortOrder: nextSort,
        posCode: pos.code,
        rentConfig: { create: { rentType: "GP", gpPercentStorefront: 0, gpPercentDelivery: 0 } },
      },
    });
    events.push({ kind: "created", posCode: pos.code, name: created.name });
  }
  return events;
}

export async function syncPosDailySalesRange(start: Date, end: Date): Promise<PosSyncResult> {
  if (end < POS_SYNC_START_DATE) return { changed: 0, branchEvents: [] };
  const effectiveStart = start < POS_SYNC_START_DATE ? POS_SYNC_START_DATE : start;
  const [allBranches, reports] = await Promise.all([
    prisma.branch.findMany({ select: { id: true, code: true, name: true, posCode: true, isActive: true, sortOrder: true } }),
    getBranchSalesReports(effectiveStart, end),
  ]);
  // สร้าง/ผูก/เปิดสาขาให้ครบก่อน แล้วค่อยดึงยอด — สาขาที่เพิ่งสร้างจะได้ยอดของช่วงนี้ในรอบเดียวกันเลย
  const branchEvents = await autoLinkPosBranches(allBranches, reports, end);
  const [branches, existingRows] = await Promise.all([
    prisma.branch.findMany({ where: { posCode: { not: null } } }),
    prisma.dailySales.findMany({
      where: { date: { gte: effectiveStart, lte: end }, branch: { posCode: { not: null } } },
      select: {
        branchId: true,
        date: true,
        storefrontOverride: true,
        grabOverride: true,
        linemanOverride: true,
        shopeeOverride: true,
        cashCountedOverride: true,
        cashPos: true,
        transfer: true,
        cashTransferCombined: true,
        cashCounted: true,
        grab: true,
        lineman: true,
        shopee: true,
      },
    }),
  ]);
  const branchByPosCode = new Map(branches.map((b) => [b.posCode as string, b]));
  const existingByKey = new Map(existingRows.map((r) => [`${r.branchId}_${r.date.toISOString().slice(0, 10)}`, r]));

  const writes: (() => Promise<unknown>)[] = [];
  for (const report of reports.values()) {
    const branch = branchByPosCode.get(report.posCode);
    if (!branch) continue;
    const date = new Date(`${report.date}T00:00:00.000Z`);
    const existing = existingByKey.get(`${branch.id}_${report.date}`);
    const data = buildSyncedData(branch.type, report, existing);
    if (Object.keys(data).length === 0) continue; // nothing changed — skip the write entirely
    writes.push(() =>
      prisma.dailySales.upsert({
        where: { branchId_date: { branchId: branch.id, date } },
        update: data,
        create: { branchId: branch.id, date, ...data },
      })
    );
  }
  // จำกัดจำนวน upsert ที่ยิงพร้อมกัน — ถ้ามีหลายวัน/สาขาเปลี่ยนพร้อมกัน (เช่น sync ครั้งแรกหลังไม่ได้เข้าเว็บนาน)
  // ยิงพร้อมกันหมดจะไปชน connection pool ของ pgbouncer จนคิวรอกันเองช้ามาก (วัดจริงกับ pattern เดียวกันที่
  // หน้า credit-term เจอ — N คำถามพร้อมกันช้ากว่าคำถามเดียวมาก)
  await runWithConcurrency(writes, 8);
  return { changed: writes.length, branchEvents };
}

export async function syncDailySalesFromPos(branchId: string, date: Date) {
  if (date < POS_SYNC_START_DATE) return null;
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch?.posCode) return null;
  const reports = await getBranchSalesReports(date, date);
  const report = reports.get(`${branch.posCode}_${date.toISOString().slice(0, 10)}`);
  if (!report) return null;

  const existing = await prisma.dailySales.findUnique({
    where: { branchId_date: { branchId, date } },
    select: {
      storefrontOverride: true,
      grabOverride: true,
      linemanOverride: true,
      shopeeOverride: true,
      cashCountedOverride: true,
      cashPos: true,
      transfer: true,
      cashTransferCombined: true,
      cashCounted: true,
      grab: true,
      lineman: true,
      shopee: true,
    },
  });
  const data = buildSyncedData(branch.type, report, existing);
  if (Object.keys(data).length === 0) return existing;

  return prisma.dailySales.upsert({
    where: { branchId_date: { branchId, date } },
    update: data,
    create: { branchId, date, ...data },
  });
}
