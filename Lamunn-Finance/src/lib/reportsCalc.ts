import { unstable_cache } from "next/cache";
import { prisma } from "@lamunn/db-finance";
import { getBranchesLite } from "./branchCache";

/** แท็ก cache ของข้อมูลยอดขายทั้งก้อน — ทุก route ที่เขียน daily_sales / company_channel_daily ต้อง revalidateTag ตัวนี้
 * (daily-sales POST, company-channel POST, sync/recent, cron sync) ไม่งั้นหน้ารายงานจะเห็นของเก่าได้นานสุด 2 นาที */
export const SALES_DATA_CACHE_TAG = "sales-data";

/** ยอดขายรวมทั้งบริษัทรายวัน (ทุกสาขา + E-Commerce กลาง) สำหรับช่วงวันที่ที่กำหนด */
export async function getDailyTotals(start: Date, end: Date): Promise<Map<string, number>> {
  const [salesRows, companyRows] = await Promise.all([
    prisma.dailySales.findMany({
      where: { date: { gte: start, lte: end } },
      select: { date: true, cashPos: true, transfer: true, cashTransferCombined: true, grab: true, lineman: true, shopee: true, branch: { select: { type: true } } },
    }),
    prisma.companyChannelDaily.findMany({
      where: { date: { gte: start, lte: end } },
      select: { date: true, tiktok: true, fbLine: true, pickup: true, catering: true },
    }),
  ]);

  const byDate = new Map<string, number>();
  for (const r of salesRows) {
    const storefront = r.branch.type === "CASH" ? (r.cashPos ?? 0) + (r.transfer ?? 0) : r.cashTransferCombined ?? 0;
    const total = storefront + r.grab + r.lineman + r.shopee;
    const key = r.date.toISOString().slice(0, 10);
    byDate.set(key, (byDate.get(key) ?? 0) + total);
  }
  for (const c of companyRows) {
    const key = c.date.toISOString().slice(0, 10);
    const ecom = c.tiktok + c.fbLine + c.pickup + c.catering;
    byDate.set(key, (byDate.get(key) ?? 0) + ecom);
  }
  return byDate;
}

// ───────────────────── โหลดครั้งเดียว คำนวณทุกช่วงในหน่วยความจำ ─────────────────────
//
// หน้า "รายงาน/วิเคราะห์" ต้องใช้ยอดขายหลายช่วงพร้อมกัน (เดือนนี้ เดือนก่อน สัปดาห์นี้ สัปดาห์ก่อน
// ปีนี้ ปีก่อน รายสาขา แยกช่องทาง) เดิมยิงคิวรีแยกช่วงละชุด รวม ~20 คิวรีเรียงต่อกัน 9 ชั้น
// ทั้งที่ตาราง daily_sales ทั้งตารางมีแค่ไม่กี่พันแถวและถูกดึงมาทั้งก้อนอยู่แล้วอยู่ดี
//
// ฟังก์ชันกลุ่มนี้ดึงทุกอย่างทีเดียว 3 คิวรีขนาน แล้วตัดช่วง/รวมยอดในหน่วยความจำแทน

export interface SalesRowLite {
  branchId: string;
  date: Date;
  cashPos: number | null;
  transfer: number | null;
  cashTransferCombined: number | null;
  grab: number;
  lineman: number;
  shopee: number;
}

export interface CompanyRowLite {
  date: Date;
  tiktok: number;
  fbLine: number;
  pickup: number;
  catering: number;
}

export interface BranchLite {
  id: string;
  name: string;
  type: "CASH" | "CREDIT_TERM";
  isActive: boolean;
}

export interface ChannelSums {
  cashPos: number | null;
  transfer: number | null;
  cashTransferCombined: number | null;
  grab: number | null;
  lineman: number | null;
  shopee: number | null;
}

// unstable_cache เก็บได้แค่ค่าที่ serialize เป็น JSON ได้ — Date จะกลายเป็น string เงียบๆ
// จึงเก็บวันที่เป็น ISO string ในแคช แล้วแปลงกลับเป็น Date ตอนอ่านออกมา (ผู้เรียกใช้ .toISOString()/เทียบ Date ต่อได้เหมือนเดิม)
const loadAllSalesDataCached = unstable_cache(
  async () => {
    const [branches, salesRows, companyRows] = await Promise.all([
      getBranchesLite(),
      prisma.dailySales.findMany({
        select: { branchId: true, date: true, cashPos: true, transfer: true, cashTransferCombined: true, grab: true, lineman: true, shopee: true },
        orderBy: { date: "asc" },
      }),
      prisma.companyChannelDaily.findMany({
        select: { date: true, tiktok: true, fbLine: true, pickup: true, catering: true },
      }),
    ]);
    return {
      branches,
      salesRows: salesRows.map((r) => ({ ...r, date: r.date.toISOString() })),
      companyRows: companyRows.map((r) => ({ ...r, date: r.date.toISOString() })),
    };
  },
  ["load-all-sales-data"],
  { revalidate: 120, tags: [SALES_DATA_CACHE_TAG] }
);

/** ดึงข้อมูลทุกอย่างที่หน้ารายงานต้องใช้ ในคิวรีขนานชุดเดียว
 * แคชไว้ 2 นาที (และล้างทันทีเมื่อมีการบันทึกยอดขาย) — ตาราง daily_sales ทั้งก้อนคือส่วนที่หนักที่สุดของหน้ารายงาน
 * แต่เปลี่ยนแค่วันละไม่กี่ครั้ง ไม่จำเป็นต้องดึงใหม่ทุกครั้งที่เปิดหน้า */
export async function loadAllSalesData(): Promise<{
  branches: BranchLite[];
  salesRows: SalesRowLite[];
  companyRows: CompanyRowLite[];
}> {
  const cached = await loadAllSalesDataCached();
  return {
    branches: cached.branches,
    salesRows: cached.salesRows.map((r) => ({ ...r, date: new Date(r.date) })),
    companyRows: cached.companyRows.map((r) => ({ ...r, date: new Date(r.date) })),
  };
}

/** ยอดขายรวมรายวันทุกช่องทาง จากข้อมูลที่โหลดมาแล้ว (ไม่ยิงคิวรีเพิ่ม) */
export function dailyTotalsFrom(
  salesRows: SalesRowLite[],
  companyRows: CompanyRowLite[],
  branchType: Map<string, "CASH" | "CREDIT_TERM">
): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const r of salesRows) {
    const type = branchType.get(r.branchId);
    if (!type) continue;
    const storefront = type === "CASH" ? (r.cashPos ?? 0) + (r.transfer ?? 0) : r.cashTransferCombined ?? 0;
    const key = r.date.toISOString().slice(0, 10);
    byDate.set(key, (byDate.get(key) ?? 0) + storefront + r.grab + r.lineman + r.shopee);
  }
  for (const c of companyRows) {
    const key = c.date.toISOString().slice(0, 10);
    byDate.set(key, (byDate.get(key) ?? 0) + c.tiktok + c.fbLine + c.pickup + c.catering);
  }
  return byDate;
}

/** ตัดเฉพาะช่วงวันที่ที่ต้องการออกมาเป็น Map ใหม่ — แทนการยิงคิวรีต่อช่วง */
export function sliceMap(all: Map<string, number>, start: Date, end: Date): Map<string, number> {
  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);
  const out = new Map<string, number>();
  for (const [key, value] of all) {
    if (key >= from && key <= to) out.set(key, value);
  }
  return out;
}

/** รวมยอดขายรายสาขาในช่วงวันที่ — ให้ผลเหมือน prisma.dailySales.groupBy({ by: ["branchId"], _sum }) */
export function aggregateByBranch(rows: SalesRowLite[], start: Date, end: Date): Map<string, ChannelSums> {
  const out = new Map<string, ChannelSums>();
  for (const r of rows) {
    if (r.date < start || r.date > end) continue;
    const cur =
      out.get(r.branchId) ?? { cashPos: 0, transfer: 0, cashTransferCombined: 0, grab: 0, lineman: 0, shopee: 0 };
    cur.cashPos = (cur.cashPos ?? 0) + (r.cashPos ?? 0);
    cur.transfer = (cur.transfer ?? 0) + (r.transfer ?? 0);
    cur.cashTransferCombined = (cur.cashTransferCombined ?? 0) + (r.cashTransferCombined ?? 0);
    cur.grab = (cur.grab ?? 0) + r.grab;
    cur.lineman = (cur.lineman ?? 0) + r.lineman;
    cur.shopee = (cur.shopee ?? 0) + r.shopee;
    out.set(r.branchId, cur);
  }
  return out;
}

export function seriesForRange(dailyTotals: Map<string, number>, start: Date, end: Date): number[] {
  const out: number[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(dailyTotals.get(d.toISOString().slice(0, 10)) ?? 0);
  }
  return out;
}

export function sumMap(m: Map<string, number>): number {
  return Array.from(m.values()).reduce((a, v) => a + v, 0);
}
