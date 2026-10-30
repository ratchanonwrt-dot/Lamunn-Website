import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@lamunn/db-finance";
import { requireSectionPage } from "@/lib/permissions";
import MonthFilterBar from "@/components/MonthFilterBar";
import { computeSssg } from "@/lib/sssgCalc";
import { monthRange } from "@/lib/dates";
import { formatBaht, formatPercent, thaiMonthLabel } from "@/lib/format";
import {
  loadAllSalesData,
  dailyTotalsFrom,
  sliceMap,
  aggregateByBranch,
  seriesForRange,
  sumMap,
  type ChannelSums,
} from "@/lib/reportsCalc";
import DonutChart, { CHART_COLORS } from "@/components/charts/DonutChart";
import LineChart from "@/components/charts/LineChart";
import ReportSection from "@/components/ReportSection";
import { computeBranchDailyStats } from "@/lib/branchDailyStats";
import BranchDailyAnalysis, { ANALYSIS_SORTS, type AnalysisSort, type AnalysisParams } from "./BranchDailyAnalysis";
import SalesExplorer, { type ExplorerParams } from "./SalesExplorer";
import { computeSalesExplorer } from "@/lib/salesExplorer";

function pct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

function ChangeBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-gray-400">-</span>;
  const up = value >= 0;
  return (
    <span className={`text-xs font-medium ${up ? "text-emerald-600" : "text-red-600"}`}>
      {up ? "▲" : "▼"} {formatPercent(Math.abs(value))}
    </span>
  );
}

function ReportsSkeleton() {
  return (
    <div className="mt-6 animate-pulse">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border border-gray-200 bg-white" />
        ))}
      </div>
      <div className="mt-6 h-40 rounded-xl border border-gray-200 bg-white" />
      <div className="mt-6 h-64 rounded-xl border border-gray-200 bg-white" />
    </div>
  );
}

// หัวหน้า + ตัวกรองเดือนไม่ต้องรอ query ยอดขายย้อนหลังหลายช่วง (หนักสุดของหน้านี้) เลย ให้ shell ขึ้นก่อนได้
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string; aFrom?: string; aTo?: string; low?: string; div?: string; aSort?: string; xBr?: string | string[]; xFrom?: string; xTo?: string };
}) {
  await requireSectionPage("REPORTS");
  const now = new Date();
  const year = Number(searchParams.year) || now.getUTCFullYear();
  const month = Number(searchParams.month) || now.getUTCMonth() + 1;
  const analysis = analysisParams(searchParams, year, month);
  const explorer = explorerParams(searchParams, year, month);
  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-gray-800">ภาพรวมและวิเคราะห์ยอดขาย</h1>
      <MonthFilterBar basePath="/reports" year={year} month={month} />
      <Suspense fallback={<ReportsSkeleton />}>
        <ReportsData year={year} month={month} analysis={analysis.params} analysisRequested={analysis.requested} explorer={explorer.params} explorerRequested={explorer.requested} />
      </Suspense>
    </div>
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** ค่าตั้งของหมวด "วิเคราะห์ยอดรายสาขา" จาก URL — ค่าเริ่มต้น: ต้นเดือนที่เลือกถึง "เมื่อวาน" (เวลาไทย)
 * ไม่รวมวันนี้เพราะยอดวันนี้ยังส่งเข้ามาไม่ครบ ถ้านับจะกลายเป็น "วันยอดต่ำ" ปลอมของทุกสาขา */
function analysisParams(
  sp: { aFrom?: string; aTo?: string; low?: string; div?: string; aSort?: string },
  year: number,
  month: number
): { params: AnalysisParams; requested: boolean } {
  const bkk = new Date(Date.now() + 7 * 3600 * 1000);
  const today = new Date(Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), bkk.getUTCDate()));
  const yesterday = new Date(today.getTime() - 86400000);
  const { start, end } = monthRange(year, month - 1);
  const monthTo = end < yesterday ? end : yesterday < start ? start : yesterday;

  let from = ISO_DATE.test(sp.aFrom ?? "") ? sp.aFrom! : iso(start);
  let to = ISO_DATE.test(sp.aTo ?? "") ? sp.aTo! : iso(monthTo);
  if (to < from) [from, to] = [to, from];
  // กันช่วงยาวเกินไป (เกิน 1 ปี) — ตัดต้นช่วงให้เหลือ 366 วันนับจากวันสุดท้าย
  const maxFrom = iso(new Date(new Date(`${to}T00:00:00Z`).getTime() - 365 * 86400000));
  if (from < maxFrom) from = maxFrom;

  const lowRaw = Number(sp.low);
  const divRaw = Number(sp.div);
  const sort = ANALYSIS_SORTS.includes(sp.aSort as AnalysisSort) ? (sp.aSort as AnalysisSort) : "avg";
  const back = (days: number) => iso(new Date(yesterday.getTime() - (days - 1) * 86400000));

  return {
    requested: Boolean(sp.aFrom || sp.aTo || sp.low || sp.div || sp.aSort),
    params: {
      year,
      month,
      from,
      to,
      low: Number.isFinite(lowRaw) && lowRaw >= 0 && sp.low ? lowRaw : 5000,
      div: Number.isFinite(divRaw) && divRaw > 0 ? divRaw : 139,
      sort,
      presets: [
        { label: "เดือนที่เลือก", from: iso(start), to: iso(monthTo) },
        { label: "14 วันล่าสุด", from: back(14), to: iso(yesterday) },
        { label: "30 วันล่าสุด", from: back(30), to: iso(yesterday) },
      ],
    },
  };
}

/** ค่าตั้งของหมวด "ดูยอดขายตามสาขา + Trend" — ค่าเริ่มต้น: ทุกสาขา 30 วันล่าสุดถึงเมื่อวาน (เวลาไทย)
 * ไม่รวมวันนี้เพราะยอดยังเข้าไม่ครบ จะทำให้เส้น Trend ดิ่งปลอมตอนท้าย */
function explorerParams(
  sp: { xBr?: string | string[]; xFrom?: string; xTo?: string },
  year: number,
  month: number
): { params: ExplorerParams; requested: boolean } {
  const bkk = new Date(Date.now() + 7 * 3600 * 1000);
  const today = new Date(Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), bkk.getUTCDate()));
  const yesterday = new Date(today.getTime() - 86400000);
  const back = (days: number) => iso(new Date(yesterday.getTime() - (days - 1) * 86400000));
  const { start, end } = monthRange(year, month - 1);
  const monthTo = end < yesterday ? end : yesterday < start ? start : yesterday;

  let from = ISO_DATE.test(sp.xFrom ?? "") ? sp.xFrom! : back(30);
  let to = ISO_DATE.test(sp.xTo ?? "") ? sp.xTo! : iso(yesterday);
  if (to < from) [from, to] = [to, from];
  const maxFrom = iso(new Date(new Date(`${to}T00:00:00Z`).getTime() - 365 * 86400000));
  if (from < maxFrom) from = maxFrom;

  const branchIds = (Array.isArray(sp.xBr) ? sp.xBr : sp.xBr ? [sp.xBr] : []).filter(Boolean);
  return {
    requested: Boolean(sp.xBr || sp.xFrom || sp.xTo),
    params: {
      year,
      month,
      branchIds,
      from,
      to,
      presets: [
        { label: "7 วัน", from: back(7), to: iso(yesterday) },
        { label: "14 วัน", from: back(14), to: iso(yesterday) },
        { label: "30 วัน", from: back(30), to: iso(yesterday) },
        { label: "90 วัน", from: back(90), to: iso(yesterday) },
        { label: "เดือนที่เลือก", from: iso(start), to: iso(monthTo) },
      ],
    },
  };
}

async function ReportsData({
  year,
  month,
  analysis,
  analysisRequested,
  explorer,
  explorerRequested,
}: {
  year: number;
  month: number;
  analysis: AnalysisParams;
  analysisRequested: boolean;
  explorer: ExplorerParams;
  explorerRequested: boolean;
}) {
  const now = new Date();
  const { start, end } = monthRange(year, month - 1);
  const clampedEnd = end > now ? now : end;

  const lastMonthDate = new Date(Date.UTC(year, month - 2, 1));
  const { start: lastStart, end: lastEnd } = monthRange(lastMonthDate.getUTCFullYear(), lastMonthDate.getUTCMonth());

  // ═══ โหลดข้อมูลทั้งหมดทีเดียว 3 คิวรีขนาน แล้วคำนวณทุกช่วงในหน่วยความจำ ═══
  //
  // เดิมหน้านี้ยิง ~20 คิวรีเรียงต่อกัน 9 ชั้น (เดือนนี้/เดือนก่อน/สัปดาห์/ปี/รายสาขา/แยกช่องทาง
  // อย่างละชุด) ทั้งที่หนึ่งในนั้นดึงตาราง daily_sales มาทั้งตารางอยู่แล้ว — ตัวเลขที่เหลือ
  // คำนวณจากก้อนเดียวกันได้หมด ตารางมีไม่กี่พันแถว การรวมยอดในหน่วยความจำเร็วกว่าการวิ่งไป-กลับ
  // ฐานข้อมูลอีกสิบกว่ารอบมาก (ดูรายละเอียดฟังก์ชันใน lib/reportsCalc.ts)
  const { branches, salesRows: allSalesRows, companyRows: allCompanyRows } = await loadAllSalesData();
  const branchTypeMap = new Map(branches.map((b) => [b.id, b.type]));
  const dailyAll = dailyTotalsFrom(allSalesRows, allCompanyRows, branchTypeMap);

  // --- ยอดขายรวมรายวัน (ทุกช่องทาง) เดือนนี้ + เดือนก่อน สำหรับกราฟเส้นเทียบ ---
  const thisMonthDaily = sliceMap(dailyAll, start, clampedEnd);
  const lastMonthDaily = sliceMap(dailyAll, lastStart, lastEnd);
  const thisMonthTotal = sumMap(thisMonthDaily);
  const lastMonthTotal = sumMap(lastMonthDaily);
  const daysSoFar = Math.max(1, Math.round((clampedEnd.getTime() - start.getTime()) / 86400000) + 1);
  const dailyAverage = thisMonthTotal / daysSoFar;

  // เทียบ "เดือนก่อน" แบบตัดให้เหลือจำนวนวันเท่ากับเดือนนี้ (daysSoFar วันแรกของเดือนก่อน) ไม่งั้นถ้าเดือนนี้
  // ยังไม่จบเดือน (เช่น ผ่านมาแค่ 6 วัน) จะไปเทียบกับเดือนก่อนแบบเต็มเดือน ดูเหมือนยอดตกทั้งที่จริงๆ ยังไม่ครบเดือน
  const lastMonthMatchedEnd = new Date(Math.min(lastStart.getTime() + (daysSoFar - 1) * 86400000, lastEnd.getTime()));
  const lastMonthMatchedDaily = sliceMap(dailyAll, lastStart, lastMonthMatchedEnd);
  const lastMonthMatchedTotal = sumMap(lastMonthMatchedDaily);

  // --- สัปดาห์นี้ vs สัปดาห์ที่แล้ว (rolling 7 วันจากวันนี้) ---
  const weekEnd = now;
  const weekStart = new Date(now.getTime() - 6 * 86400000);
  const prevWeekEnd = new Date(now.getTime() - 7 * 86400000);
  const prevWeekStart = new Date(now.getTime() - 13 * 86400000);
  const thisWeekDaily = sliceMap(dailyAll, weekStart, weekEnd);
  const prevWeekDaily = sliceMap(dailyAll, prevWeekStart, prevWeekEnd);
  const thisWeekTotal = sumMap(thisWeekDaily);
  const prevWeekTotal = sumMap(prevWeekDaily);

  // --- ยอดขายรวมทั้งปี (ถึงสิ้นเดือนที่กำลังดูอยู่) vs ปีก่อนช่วงเดียวกัน ---
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const { end: yearToMonthEndRaw } = monthRange(year, month - 1);
  const yearToMonthEnd = yearToMonthEndRaw > now ? now : yearToMonthEndRaw;
  const lastYearStart = new Date(Date.UTC(year - 1, 0, 1));
  const { end: lastYearToMonthEnd } = monthRange(year - 1, month - 1);
  const yearDaily = sliceMap(dailyAll, yearStart, yearToMonthEnd);
  const lastYearDaily = sliceMap(dailyAll, lastYearStart, lastYearToMonthEnd);
  const yearTotal = sumMap(yearDaily);
  const lastYearTotal = sumMap(lastYearDaily);

  // แจกแจงยอดทั้งปีเป็นรายเดือน (ม.ค. ถึงเดือนที่กำลังดูอยู่) — เห็นภาพรวมทั้งปีในตารางเดียว
  const monthlyBreakdown = new Map<number, number>();
  for (const [dateKey, amount] of yearDaily) {
    const m = new Date(`${dateKey}T00:00:00.000Z`).getUTCMonth();
    monthlyBreakdown.set(m, (monthlyBreakdown.get(m) ?? 0) + amount);
  }
  const monthlyBreakdownRows = Array.from({ length: month }, (_, i) => ({
    month: i,
    total: monthlyBreakdown.get(i) ?? 0,
  }));
  const maxMonthlyTotal = Math.max(1, ...monthlyBreakdownRows.map((r) => r.total));

  // --- Ranking รายสาขา: เดือนนี้ vs เดือนก่อน ---
  // ไม่กรอง isActive — สาขาที่ปิดไปแล้วต้องยังเห็นในอันดับของเดือนที่เคยเปิดอยู่ (branches โหลดมาแล้วด้านบน)
  type ChannelBreakdown = { storefront: number; grab: number; lineman: number; shopee: number };
  const channelFor = (type: "CASH" | "CREDIT_TERM", s?: ChannelSums): ChannelBreakdown => {
    if (!s) return { storefront: 0, grab: 0, lineman: 0, shopee: 0 };
    const storefront = type === "CASH" ? (s.cashPos ?? 0) + (s.transfer ?? 0) : s.cashTransferCombined ?? 0;
    return { storefront, grab: s.grab ?? 0, lineman: s.lineman ?? 0, shopee: s.shopee ?? 0 };
  };
  const totalFor = (type: "CASH" | "CREDIT_TERM", s?: ChannelSums) => {
    const c = channelFor(type, s);
    return c.storefront + c.grab + c.lineman + c.shopee;
  };

  // วันที่มียอดขายจริงวันแรกสุดของแต่ละสาขา (ทุกช่วงเวลา) — ใช้เช็คว่าประวัติย้อนหลังของสาขานั้นครอบคลุมช่วง "เดือนก่อน"
  // ที่เอามาเทียบหรือไม่ ถ้าสาขาเพิ่งเริ่มมียอดขายจริงกลางช่วงที่เอามาเทียบ (เช่น เปิดสาขาวันที่ 5 แต่เทียบตั้งแต่วันที่ 1)
  // ผลรวม "เดือนก่อน" จะขาดไปบางวันแบบไม่รู้ตัว ทำให้ฐานเทียบเล็กเกินจริงและ % โตเกินจริง — ใช้ยอดขายจริง > 0 เป็นตัวชี้วัด
  // ไม่ใช่แค่ "มีแถวข้อมูล" เพราะบางสาขามีแถวที่กรอกไว้ล่วงหน้าเป็น 0 ก่อนเปิดร้านจริง (แถวมีอยู่ แต่ไม่ใช่วันขายจริง)
  const thisMap = aggregateByBranch(allSalesRows, start, clampedEnd);
  const lastMap = aggregateByBranch(allSalesRows, lastStart, lastMonthMatchedEnd);
  // นับ "จำนวนวันที่มียอดขายจริง" ของแต่ละสาขาในช่วงเดือนก่อนที่เอามาเทียบ (ไม่ใช่แค่ช่วงวันแรก-วันสุดท้ายที่มีแถว)
  // เพราะบางสาขามีข้อมูลจริงต้นเดือน แต่ตรงกลางเดือนขาดหายเป็นยอด 0 ยาวหลายวัน (เช่น ระบบไม่ได้กรอกให้ช่วงหนึ่ง)
  // ถ้าตัดแค่ "วันแรกที่มีข้อมูล" อย่างเดียวจะจับเคสนี้ไม่ได้ ต้องนับวันที่มียอดจริง ๆ แล้วเทียบด้วยจำนวนวันเท่ากันแทน
  const realDaysLastMonthMap = new Map<string, number>();
  for (const row of allSalesRows) {
    const type = branchTypeMap.get(row.branchId);
    if (!type || totalFor(type, row) <= 0) continue;
    if (row.date >= lastStart && row.date <= lastMonthMatchedEnd) {
      realDaysLastMonthMap.set(row.branchId, (realDaysLastMonthMap.get(row.branchId) ?? 0) + 1);
    }
  }
  const rankingBase = branches
    .map((b) => {
      const thisChannel = channelFor(b.type, thisMap.get(b.id));
      const lastChannel = channelFor(b.type, lastMap.get(b.id));
      const thisTotal = thisChannel.storefront + thisChannel.grab + thisChannel.lineman + thisChannel.shopee;
      const lastTotal = lastChannel.storefront + lastChannel.grab + lastChannel.lineman + lastChannel.shopee;
      // สาขาใหม่ = ไม่มียอดขายเลยในรอบก่อนหน้า (เดือนก่อน) — เทียบ % แล้วบิดเบือน เพราะจริงๆ ไม่เคยมีฐานให้เทียบ
      const isNewBranch = lastTotal === 0 && thisTotal > 0;
      // เปิดไม่เต็มช่วงที่เทียบ = จำนวนวันที่มียอดขายจริงในเดือนก่อน (ภายใน daysSoFar วันแรก) น้อยกว่าเดือนนี้
      // ไม่ว่าจะเพราะเปิดสาขาทีหลัง หรือมียอด 0 แทรกอยู่กลางเดือน ก็ต้องตัดเดือนนี้ให้เหลือจำนวนวันเท่ากันถึงจะยุติธรรม
      const realDaysLastMonth = realDaysLastMonthMap.get(b.id) ?? 0;
      const isPartialLastMonth = lastTotal > 0 && realDaysLastMonth < daysSoFar;
      const matchedDays = isPartialLastMonth ? Math.max(1, realDaysLastMonth) : daysSoFar;
      return { branch: b, thisTotal, lastTotal, thisChannel, lastChannel, isNewBranch, isPartialLastMonth, matchedDays };
    })
    .sort((a, b) => b.thisTotal - a.thisTotal);

  // สำหรับสาขาที่เปิดไม่เต็มช่วงเทียบ ต้องรู้ยอดขาย "N วันแรก" ของเดือนนี้ (ไม่ใช่ยอดเต็ม daysSoFar วัน) เพื่อเทียบจำนวนวันให้เท่ากัน
  // ดึงเฉพาะแถวรายวันของสาขากลุ่มนี้มาตัดเอง เพราะแต่ละสาขามีจำนวนวันที่ต้องตัด (matchedDays) ไม่เท่ากัน
  const partialBranches = rankingBase.filter((r) => r.isPartialLastMonth);
  const matchedThisTotalMap = new Map<string, number>();
  const matchedThisChannelMap = new Map<string, ChannelBreakdown>();
  if (partialBranches.length > 0) {
    // ตัดจากข้อมูลที่โหลดมาแล้ว ไม่ต้องยิงคิวรีเพิ่ม
    const partialIds = new Set(partialBranches.map((r) => r.branch.id));
    const partialRows = allSalesRows.filter((row) => partialIds.has(row.branchId) && row.date >= start && row.date <= clampedEnd);
    const rowsByBranch = new Map<string, typeof partialRows>();
    for (const row of partialRows) {
      const arr = rowsByBranch.get(row.branchId) ?? [];
      arr.push(row);
      rowsByBranch.set(row.branchId, arr);
    }
    for (const r of partialBranches) {
      const cutoff = new Date(start.getTime() + (r.matchedDays - 1) * 86400000);
      const sums = (rowsByBranch.get(r.branch.id) ?? [])
        .filter((row) => row.date <= cutoff)
        .reduce(
          (acc, row) => ({
            cashPos: acc.cashPos + (row.cashPos ?? 0),
            transfer: acc.transfer + (row.transfer ?? 0),
            cashTransferCombined: acc.cashTransferCombined + (row.cashTransferCombined ?? 0),
            grab: acc.grab + row.grab,
            lineman: acc.lineman + row.lineman,
            shopee: acc.shopee + row.shopee,
          }),
          { cashPos: 0, transfer: 0, cashTransferCombined: 0, grab: 0, lineman: 0, shopee: 0 }
        );
      matchedThisTotalMap.set(r.branch.id, totalFor(r.branch.type, sums));
      matchedThisChannelMap.set(r.branch.id, channelFor(r.branch.type, sums));
    }
  }

  const ranking = rankingBase.map((r) => {
    const compareThisTotal = r.isPartialLastMonth ? matchedThisTotalMap.get(r.branch.id) ?? r.thisTotal : r.thisTotal;
    const compareThisChannel = r.isPartialLastMonth ? matchedThisChannelMap.get(r.branch.id) ?? r.thisChannel : r.thisChannel;
    return { ...r, compareThisTotal, compareThisChannel, change: pct(compareThisTotal, r.lastTotal) };
  });

  // สาขาที่เทียบกันได้จริง (มียอดทั้งสองรอบ) แยกเป็นขึ้น/ตก เรียงจาก % เปลี่ยนแปลงมากไปน้อย
  // สาขาที่เปิดไม่เต็มช่วงเทียบยังรวมอยู่ด้วย แต่ % คำนวณจากยอด "N วันแรก" ที่จำนวนวันเท่ากับเดือนก่อน (ดู matchedDays)
  const comparableBranches = ranking.filter((r) => r.lastTotal > 0 && r.change !== null);
  const branchesUp = comparableBranches.filter((r) => r.change! > 0).sort((a, b) => b.change! - a.change!);
  const branchesDown = comparableBranches.filter((r) => r.change! < 0).sort((a, b) => a.change! - b.change!);

  // --- SSSG สาขาเดิม เดือนนี้ vs เดือนก่อน แบบ "เฉลี่ยต่อวันที่เปิดจริง" (รายละเอียดใน lib/sssgCalc.ts และแท็บ /reports/sssg) ---
  const sssg = computeSssg(branches, allSalesRows, { start, end: clampedEnd }, { start: lastStart, end: lastEnd });
  const sssgPrevLabel = thaiMonthLabel(lastMonthDate.getUTCFullYear(), lastMonthDate.getUTCMonth());

  // --- วิเคราะห์ยอดรายสาขา: วันยอดต่ำ / เฉลี่ยวันธรรมดา vs ส-อา / ยอดเฉลี่ย ÷ ตัวหาร (lib/branchDailyStats.ts) ---
  const dailyStats = computeBranchDailyStats(
    branches,
    allSalesRows,
    new Date(`${analysis.from}T00:00:00.000Z`),
    new Date(`${analysis.to}T00:00:00.000Z`),
    analysis.low
  );
  const lowBranchCount = dailyStats.filter((s) => s.lowDates.length > 0).length;
  const lowDayCount = dailyStats.reduce((a, s) => a + s.lowDates.length, 0);

  // --- ดูยอดขายตามสาขา/ช่วงวัน + Trend (lib/salesExplorer.ts) — ใช้ข้อมูลก้อนเดียวกัน ไม่ยิงคิวรีเพิ่ม ---
  const explorerResult = computeSalesExplorer(branches, allSalesRows, explorer.branchIds, explorer.from, explorer.to);
  const explorerLabel =
    explorer.branchIds.length === 0
      ? "ทุกสาขา"
      : explorer.branchIds.length <= 2
        ? branches.filter((b) => explorer.branchIds.includes(b.id)).map((b) => b.name).join(", ")
        : `${explorer.branchIds.length} สาขา`;
  const explorerTrendText = { up: "ขาขึ้น", down: "ขาลง", flat: "ทรงตัว", none: "ข้อมูลไม่พอ" }[explorerResult.trend.direction];

  // --- แยกช่องทาง (เดือนนี้) ---
  let storefrontTotal = 0;
  let grabTotal = 0;
  let linemanTotal = 0;
  let shopeeTotal = 0;
  for (const row of allSalesRows) {
    if (row.date < start || row.date > clampedEnd) continue;
    const type = branchTypeMap.get(row.branchId);
    if (!type) continue;
    storefrontTotal += type === "CASH" ? (row.cashPos ?? 0) + (row.transfer ?? 0) : row.cashTransferCombined ?? 0;
    grabTotal += row.grab;
    linemanTotal += row.lineman;
    shopeeTotal += row.shopee;
  }
  const ecom = { tiktok: 0, fbLine: 0, pickup: 0, catering: 0 };
  for (const c of allCompanyRows) {
    if (c.date < start || c.date > clampedEnd) continue;
    ecom.tiktok += c.tiktok;
    ecom.fbLine += c.fbLine;
    ecom.pickup += c.pickup;
    ecom.catering += c.catering;
  }
  const ecomTotal = ecom.tiktok + ecom.fbLine + ecom.pickup + ecom.catering;

  const channelSlices = [
    { label: "หน้าร้าน (Storefront)", value: storefrontTotal, color: CHART_COLORS.blue },
    { label: "Grab", value: grabTotal, color: CHART_COLORS.green },
    { label: "Lineman", value: linemanTotal, color: CHART_COLORS.magenta },
    ...(shopeeTotal ? [{ label: "Shopee", value: shopeeTotal, color: CHART_COLORS.orange }] : []),
    { label: "E-Commerce", value: ecomTotal, color: CHART_COLORS.yellow },
  ];
  const ecomSlices = [
    { label: "TikTok", value: ecom.tiktok, color: CHART_COLORS.aqua },
    { label: "FB / Line", value: ecom.fbLine, color: CHART_COLORS.orange },
    { label: "รับหน้าร้าน", value: ecom.pickup, color: CHART_COLORS.violet },
    { label: "Catering", value: ecom.catering, color: CHART_COLORS.red },
  ];

  const trendSeries = [
    { label: thaiMonthLabel(year, month - 1), color: CHART_COLORS.blue, points: seriesForRange(thisMonthDaily, start, clampedEnd) },
    { label: thaiMonthLabel(lastMonthDate.getUTCFullYear(), lastMonthDate.getUTCMonth()), color: "#c3c2b7", points: seriesForRange(lastMonthDaily, lastStart, lastEnd) },
  ];

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">ยอดขายรวมเดือนนี้ ({daysSoFar} วัน)</p>
          <p className="mt-1 text-lg font-bold text-brand-700">{formatBaht(thisMonthTotal)}</p>
          <ChangeBadge value={pct(thisMonthTotal, lastMonthMatchedTotal)} />
          <span className="ml-1 text-xs text-gray-400">เทียบ {daysSoFar} วันแรกเดือนก่อน</span>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">เฉลี่ยต่อวัน (เดือนนี้)</p>
          <p className="mt-1 text-lg font-bold text-gray-800">{formatBaht(dailyAverage)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">7 วันล่าสุด</p>
          <p className="mt-1 text-lg font-bold text-gray-800">{formatBaht(thisWeekTotal)}</p>
          <ChangeBadge value={pct(thisWeekTotal, prevWeekTotal)} />
          <span className="ml-1 text-xs text-gray-400">เทียบ 7 วันก่อนหน้า</span>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">เดือนก่อน (เต็มเดือน)</p>
          <p className="mt-1 text-lg font-bold text-gray-800">{formatBaht(lastMonthTotal)}</p>
          <p className="mt-0.5 text-[11px] text-gray-400">{daysSoFar} วันแรก: {formatBaht(lastMonthMatchedTotal)}</p>
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
          <p className="text-xs text-brand-700">ยอดขายรวมทั้งปี {year + 543} (ถึง {thaiMonthLabel(year, month - 1)})</p>
          <p className="mt-1 text-lg font-bold text-brand-700">{formatBaht(yearTotal)}</p>
          <ChangeBadge value={pct(yearTotal, lastYearTotal)} />
          <span className="ml-1 text-xs text-brand-600">เทียบปีก่อนช่วงเดียวกัน ({formatBaht(lastYearTotal)})</span>
        </div>
      </div>

      <ReportSection
        tone="amber"
        title={`SSSG — สาขาเดิม ${thaiMonthLabel(year, month - 1)} vs ${sssgPrevLabel} (เฉลี่ยต่อวันที่เปิดจริง)`}
        summary={
          sssg.comparable.length === 0 ? (
            "ไม่มีสาขาที่เทียบได้"
          ) : (
            <>
              {sssg.comparable.length} สาขา · เฉลี่ย {formatBaht(sssg.current.avgPerDay)}/วัน <ChangeBadge value={sssg.change} />
            </>
          )
        }
      >
        <div className="mb-1 flex justify-end">
          <Link href={`/reports/sssg?year=${year}&month=${month}`} className="text-xs font-medium text-brand-600 hover:underline">
            ดูรายสาขา + เรียงลำดับ →
          </Link>
        </div>
        <p className="mb-4 text-xs text-amber-700">
          นับเฉพาะสาขาที่มีวันเปิดขายทั้งสองเดือน ({sssg.comparable.length} สาขา) วันที่ยอดเป็น 0 ไม่นับ — เทียบยอดเฉลี่ยต่อวันที่เปิดจริง จึงไม่ต้องเลือกวัน เดือนที่ยังไม่จบก็เทียบได้เลย
        </p>
        {sssg.comparable.length === 0 ? (
          <p className="text-sm text-gray-500">ไม่มีสาขาที่มีวันเปิดขายทั้งสองเดือน</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-amber-200 bg-white p-4">
              <p className="text-xs text-gray-500">รวมเฉลี่ย/วัน สาขาเดิม — {thaiMonthLabel(year, month - 1)}</p>
              <p className="mt-1 text-lg font-bold text-gray-800">{formatBaht(sssg.current.avgPerDay)}</p>
              <ChangeBadge value={sssg.change} />
              <span className="ml-1 text-xs text-gray-400">เทียบ {formatBaht(sssg.previous.avgPerDay)}/วัน ({sssgPrevLabel})</span>
              <p className="mt-2 border-t border-amber-100 pt-2 text-[11px] text-gray-400">
                วันเปิดจริงรวม {sssg.current.openDays} สาขา-วัน เทียบ {sssg.previous.openDays} สาขา-วัน
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-white p-4">
              <p className="text-xs text-gray-500">แยกช่องทาง (เฉลี่ย/วันที่เปิดจริง)</p>
              <div className="mt-2 flex flex-col gap-1 text-xs">
                {(
                  [
                    ["หน้าร้าน", sssg.current.avgChannel.storefront, sssg.previous.avgChannel.storefront, sssg.channelChange.storefront],
                    ["Grab", sssg.current.avgChannel.grab, sssg.previous.avgChannel.grab, sssg.channelChange.grab],
                    ["Lineman", sssg.current.avgChannel.lineman, sssg.previous.avgChannel.lineman, sssg.channelChange.lineman],
                    ...(sssg.current.avgChannel.shopee || sssg.previous.avgChannel.shopee ? ([["Shopee", sssg.current.avgChannel.shopee, sssg.previous.avgChannel.shopee, sssg.channelChange.shopee]] as const) : []),
                  ] as const
                ).map(([label, cur, prev, change]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-gray-500">{label}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="text-gray-400">{formatBaht(prev)} →</span>
                      <span className="font-medium text-gray-700">{formatBaht(cur)}</span>
                      <ChangeBadge value={change} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {(sssg.newBranches.length > 0 || sssg.closedBranches.length > 0) && (
          <p className="mt-2 text-[11px] text-amber-600">
            {sssg.newBranches.length > 0 && `ไม่รวมสาขาที่เดือนก่อนยังไม่มีวันเปิด ${sssg.newBranches.length} สาขา: ${sssg.newBranches.map((r) => r.branch.name).join(", ")}`}
            {sssg.newBranches.length > 0 && sssg.closedBranches.length > 0 && " · "}
            {sssg.closedBranches.length > 0 && `ไม่รวมสาขาที่เดือนนี้ไม่มีวันเปิด ${sssg.closedBranches.length} สาขา: ${sssg.closedBranches.map((r) => r.branch.name).join(", ")}`}
          </p>
        )}
      </ReportSection>

      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 sm:items-start">
        <ReportSection
          tone="emerald"
          title={`สาขาที่ยอดขึ้น (${branchesUp.length})`}
          summary={branchesUp.length > 0 ? `มากสุด ${branchesUp[0].branch.name} · เทียบ ${daysSoFar} วันแรกกับเดือนก่อน` : `เทียบ ${daysSoFar} วันแรกกับเดือนก่อน`}
        >
          <div className="flex flex-col gap-1.5">
            {branchesUp.map((r) => (
              <div key={r.branch.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                <span className="text-gray-800">
                  {r.branch.name}
                  {r.isPartialLastMonth && <span className="ml-1 text-xs font-normal text-amber-600">({r.matchedDays} วัน)</span>}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{formatBaht(r.lastTotal)} → {formatBaht(r.compareThisTotal)}</span>
                  <ChangeBadge value={r.change} />
                </div>
              </div>
            ))}
            {branchesUp.length === 0 && <p className="text-sm text-emerald-700">ไม่มีสาขาที่ยอดขึ้นในรอบนี้</p>}
          </div>
        </ReportSection>

        <ReportSection
          tone="red"
          title={`สาขาที่ยอดตก (${branchesDown.length})`}
          summary={branchesDown.length > 0 ? `ตกมากสุด ${branchesDown[0].branch.name} · เทียบ ${daysSoFar} วันแรกกับเดือนก่อน` : `เทียบ ${daysSoFar} วันแรกกับเดือนก่อน`}
        >
          <div className="flex flex-col gap-1.5">
            {branchesDown.map((r) => (
              <div key={r.branch.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                <span className="text-gray-800">
                  {r.branch.name}
                  {r.isPartialLastMonth && <span className="ml-1 text-xs font-normal text-amber-600">({r.matchedDays} วัน)</span>}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{formatBaht(r.lastTotal)} → {formatBaht(r.compareThisTotal)}</span>
                  <ChangeBadge value={r.change} />
                </div>
              </div>
            ))}
            {branchesDown.length === 0 && <p className="text-sm text-red-700">ไม่มีสาขาที่ยอดตกในรอบนี้</p>}
          </div>
        </ReportSection>
      </div>

      <ReportSection
        id="branch-analysis"
        tone="brand"
        defaultOpen={analysisRequested}
        title="วิเคราะห์ยอดรายสาขา — วันยอดต่ำ · วันธรรมดา vs เสาร์-อาทิตย์ · ยอดเฉลี่ยต่อวัน"
        summary={`${dailyStats.length} สาขา · มีวันยอดต่ำกว่า ${formatBaht(analysis.low)} บาท ${lowBranchCount} สาขา รวม ${lowDayCount} วัน`}
      >
        <BranchDailyAnalysis stats={dailyStats} p={analysis} />
      </ReportSection>

      <ReportSection
        id="sales-explorer"
        tone="brand"
        defaultOpen={explorerRequested}
        title="ดูยอดขายตามสาขา / ช่วงวัน — แยกวัน · แยกช่องทาง · วิเคราะห์ Trend"
        summary={`${explorerLabel} · ${explorer.from === explorer.to ? explorer.from : `${explorer.from} ถึง ${explorer.to}`} · รวม ${formatBaht(explorerResult.totals.total)} บาท · ${explorerTrendText}`}
      >
        <SalesExplorer allBranches={branches} r={explorerResult} p={explorer} />
      </ReportSection>

      <ReportSection title={`ยอดขายรายเดือน — ปี ${year + 543}`} summary={`รวมทั้งปีถึงเดือนที่เลือก ${formatBaht(yearTotal)} บาท`}>
        <p className="mb-4 text-xs text-gray-400">ดูภาพรวมทั้งปีทีละเดือน เทียบเห็นเดือนไหนขายดี/ขายน้อยกว่ากัน</p>
        <div className="flex flex-col gap-2">
          {monthlyBreakdownRows.map((r) => (
            <div key={r.month} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs text-gray-500">{thaiMonthLabel(year, r.month).split(" ")[0]}</span>
              <div className="h-5 flex-1 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{ width: `${Math.max(2, (r.total / maxMonthlyTotal) * 100)}%` }}
                />
              </div>
              <span className="w-28 shrink-0 text-right text-xs font-medium text-gray-700">{formatBaht(r.total)}</span>
            </div>
          ))}
        </div>
      </ReportSection>

      <ReportSection
        title="สัดส่วนช่องทางการขาย (เดือนนี้)"
        summary={`หน้าร้าน ${formatBaht(storefrontTotal)} · Grab ${formatBaht(grabTotal)} · Lineman ${formatBaht(linemanTotal)}${shopeeTotal ? ` · Shopee ${formatBaht(shopeeTotal)}` : ""} · E-Commerce ${formatBaht(ecomTotal)}`}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-4 text-xs font-semibold text-gray-500">ทุกช่องทาง</h3>
            <DonutChart data={channelSlices} />
          </div>
          <div>
            <h3 className="mb-4 text-xs font-semibold text-gray-500">E-Commerce ย่อย</h3>
            <DonutChart data={ecomSlices} />
          </div>
        </div>
      </ReportSection>

      <ReportSection title="แนวโน้มยอดขายรายวัน — เทียบเดือนก่อน" summary="กราฟยอดรวมทุกช่องทางรายวัน เดือนนี้เทียบเดือนก่อน">
        <LineChart series={trendSeries} />
      </ReportSection>

      <ReportSection
        title={`อันดับสาขา — ${daysSoFar} วันแรกเดือนนี้ vs เดือนก่อน`}
        summary={ranking.length > 0 ? `อันดับ 1 ${ranking[0].branch.name} ${formatBaht(ranking[0].thisTotal)} บาท` : undefined}
      >
      <div className="mb-1 flex flex-wrap items-center justify-end gap-2">
        <Link href="/reports/ranking" className="text-xs font-medium text-brand-600 hover:underline">
          🏆 ดูอันดับแบบเลือกช่วงวันที่เอง + แยกหน้าร้าน/Delivery →
        </Link>
      </div>
      <p className="mb-3 text-xs text-gray-400">เทียบจำนวนวันเท่ากันทั้งสองเดือน ({daysSoFar} วันแรก) ให้ยุติธรรม</p>

      {/* มือถือ: การ์ดรายการ ไม่ต้องเลื่อนแนวนอน */}
      <div className="flex flex-col gap-2 sm:hidden">
        {ranking.map((r, i) => (
          <div key={r.branch.id} className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium text-gray-800">
                <span className="text-xs text-gray-400">#{i + 1}</span>
                {r.branch.name}
                {!r.branch.isActive && <span className="text-xs font-normal text-gray-400">(ปิด)</span>}
                {r.isNewBranch && <span className="text-xs font-normal text-amber-600">(สาขาใหม่)</span>}
                {r.isPartialLastMonth && <span className="text-xs font-normal text-amber-600">(เทียบ {r.matchedDays} วัน)</span>}
              </span>
              <ChangeBadge value={r.change} />
            </div>
            <div className="mt-1 flex items-baseline justify-between text-sm">
              <span className="font-semibold text-gray-800">{formatBaht(r.thisTotal)}</span>
              <span className="text-xs text-gray-400">เดือนก่อน ({daysSoFar} วันแรก) {formatBaht(r.lastTotal)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* จอใหญ่: ตาราง */}
      <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white sm:block">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2">อันดับ</th>
              <th className="px-3 py-2">สาขา</th>
              <th className="px-3 py-2 text-right">เดือนนี้ ({daysSoFar} วัน)</th>
              <th className="px-3 py-2 text-right">เดือนก่อน ({daysSoFar} วันแรก)</th>
              <th className="px-3 py-2 text-right">เปลี่ยนแปลง</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r, i) => (
              <tr key={r.branch.id} className="border-t border-gray-100">
                <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                <td className="px-3 py-2 font-medium text-gray-800">
                  {r.branch.name}
                  {!r.branch.isActive && <span className="ml-1.5 text-xs font-normal text-gray-400">(ปิดสาขาแล้ว)</span>}
                  {r.isNewBranch && <span className="ml-1.5 text-xs font-normal text-amber-600">(สาขาใหม่)</span>}
                  {r.isPartialLastMonth && <span className="ml-1.5 text-xs font-normal text-amber-600">(เทียบ {r.matchedDays} วัน)</span>}
                </td>
                <td className="px-3 py-2 text-right font-medium">{formatBaht(r.thisTotal)}</td>
                <td className="px-3 py-2 text-right text-gray-500">{formatBaht(r.lastTotal)}</td>
                <td className="px-3 py-2 text-right">
                  <ChangeBadge value={r.change} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </ReportSection>
    </>
  );
}
