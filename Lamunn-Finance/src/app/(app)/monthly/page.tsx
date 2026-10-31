import { Suspense } from "react";
import { prisma } from "@lamunn/db-finance";
import BackgroundSync from "@/components/BackgroundSync";
import { requireSectionPage } from "@/lib/permissions";
import MonthFilterBar from "@/components/MonthFilterBar";
import EditableMonthlyChannelTable from "@/components/EditableMonthlyChannelTable";
import BranchDailyMatrix from "@/components/BranchDailyMatrix";
import BranchRankingChart from "@/components/charts/BranchRankingChart";
import DonutChart, { CHART_COLORS } from "@/components/charts/DonutChart";
import ExportPanel from "@/components/ExportPanel";
import { monthRange } from "@/lib/dates";
import { formatBaht } from "@/lib/format";

const thaiMonthsShort = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const weekdaysShort = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

function MonthlySkeleton() {
  return (
    <div className="mt-6 animate-pulse">
      <div className="h-20 rounded-xl border border-gray-200 bg-white" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border border-gray-200 bg-white" />
        ))}
      </div>
      <div className="mt-6 h-64 rounded-xl border border-gray-200 bg-white" />
    </div>
  );
}

// หัวหน้า (ชื่อหน้า + Export + ตัวกรองเดือน) ไม่ต้องรอ query ยอดขายทั้งเดือน (หนักสุดของหน้านี้) เลย
// ให้ shell ขึ้นได้ทันที ส่วนข้อมูลจริงแยกไป Suspense ด้านล่าง
export default async function MonthlyOverviewPage({ searchParams }: { searchParams: { year?: string; month?: string } }) {
  await requireSectionPage("MONTHLY");
  const now = new Date();
  const year = Number(searchParams.year) || now.getUTCFullYear();
  const month = Number(searchParams.month) || now.getUTCMonth() + 1;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-800">ยอดขายรายวัน — มุมมองรายเดือน</h1>
        <ExportPanel
          apiPath="/api/export/monthly"
          extraParams={{ year: String(year), month: String(month) }}
          options={[
            { key: "dailySummary", label: "สรุปรายวัน (ทุกช่องทาง)" },
            { key: "branchDaily", label: "ยอดขายรายสาขา x รายวัน" },
            { key: "ranking", label: "Ranking สาขา (รวมทั้งเดือน)" },
          ]}
        />
      </div>
      <p className="mb-6 text-sm text-gray-500">
        ดูยอดขายทุกช่องทางแยกรายวันในเดือนเดียว แก้ไข TikTok / FB-Line / รับหน้าร้าน / Catering / ยอดเข้าบัญชี ได้ตรงนี้เลย (เหมาะสำหรับกรอกย้อนหลัง)
      </p>

      <MonthFilterBar basePath="/monthly" year={year} month={month} />

      <Suspense fallback={<MonthlySkeleton />}>
        <MonthlyData year={year} month={month} />
      </Suspense>
    </div>
  );
}

async function MonthlyData({ year, month }: { year: number; month: number }) {
  const now = new Date();
  const { start, end } = monthRange(year, month - 1);
  const daysInMonth = end.getUTCDate();
  const clampedEnd = end > now ? now : end;

  // ดึงข้อมูลจากระบบ POS/IMS ของเพื่อนมาเติมอัตโนมัติ (เฉพาะสาขา/วันที่ที่เชื่อมไว้แล้ว)
  // sync เฉพาะช่วง 4 วันล่าสุดของเดือนปัจจุบัน (ไม่ใช่ทั้งเดือน) เพื่อให้หน้าโหลดเร็ว — ข้อมูลเก่ากว่านั้น
  // cron อัตโนมัติทุกตี 04:00 ดึงให้ครบอยู่แล้ว ไม่ต้อง sync ซ้ำทุกครั้งที่เข้าหน้า
  // ไม่ sync ตรงนี้แล้ว — การยิง HTTP ไป Supabase ของระบบ POS อีกโปรเจกต์กลางการ render
  // ทำให้หน้าค้างรอทุกครั้งที่เปิด ย้ายไปให้ <BackgroundSync /> เรียกหลังหน้าแสดงผลเสร็จแทน
  // (ตัวเลขขึ้นทันทีจากฐานข้อมูล แล้วรีเฟรชเองถ้า POS มีของใหม่ ส่วน cron ตี 04:00 ยังดึงครบเหมือนเดิม)
  const isCurrentMonthView = year === now.getUTCFullYear() && month === now.getUTCMonth() + 1;

  // ไม่กรอง isActive — สาขาที่ปิดไปแล้วต้องยังเห็นยอดขายย้อนหลังของเดือนที่เคยเปิดอยู่ — 3 query นี้ไม่ได้
  // ขึ้นกับกันเลย ยิงพร้อมกันได้หมด (แยกไว้ก่อนหน้านี้เป็น 2 รอบ ทำให้เสีย round-trip ไป DB โดยไม่จำเป็น)
  const [branches, salesRows, companyRows, eventAgg] = await Promise.all([
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.dailySales.findMany({
      where: { date: { gte: start, lte: end } },
      include: { branch: { select: { type: true } } },
    }),
    prisma.companyChannelDaily.findMany({ where: { date: { gte: start, lte: end } } }),
    // ยอด Event เคยถูก await แยกต่างหากหลังจาก 3 query ข้างบนเสร็จ = เสีย round-trip ไป DB เพิ่มอีกหนึ่งรอบ
    // ทุกครั้งที่เปิดหน้า/refresh หลังกรอก ทั้งที่ไม่ได้ขึ้นกับผลของ query ไหนเลย
    prisma.eventSale.aggregate({
      where: { startDate: { gte: start, lte: clampedEnd } },
      _sum: { storefront: true, grab: true, lineman: true },
    }),
  ]);

  // สรุปรายวัน (ทุกสาขารวมกัน) — สำหรับตารางแก้ไข E-Commerce
  const dayTotals = new Map<string, { storefrontTotal: number; grab: number; lineman: number; shopee: number }>();
  for (const r of salesRows) {
    const key = r.date.toISOString().slice(0, 10);
    const existing = dayTotals.get(key) ?? { storefrontTotal: 0, grab: 0, lineman: 0, shopee: 0 };
    const storefront = r.branch.type === "CASH" ? (r.cashPos ?? 0) + (r.transfer ?? 0) : r.cashTransferCombined ?? 0;
    existing.storefrontTotal += storefront;
    existing.grab += r.grab;
    existing.lineman += r.lineman;
    existing.shopee += r.shopee;
    dayTotals.set(key, existing);
  }
  const companyByDate = new Map(companyRows.map((c) => [c.date.toISOString().slice(0, 10), c]));

  const dateKeys = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1, i + 1));
    return d.toISOString().slice(0, 10);
  });

  const dayRows: {
    date: string;
    dayLabel: string;
    storefrontTotal: number;
    grab: number;
    lineman: number;
    shopee: number;
    tiktok: number;
    fbLine: number;
    pickup: number;
    catering: number;
    depositGrab: number | null;
    depositLineman: number | null;
    depositStorefront: number | null;
    depositEcom: number | null;
    note: string | null;
  }[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(Date.UTC(year, month - 1, day));
    const key = d.toISOString().slice(0, 10);
    const t = dayTotals.get(key) ?? { storefrontTotal: 0, grab: 0, lineman: 0, shopee: 0 };
    const c = companyByDate.get(key);
    dayRows.push({
      date: key,
      dayLabel: `${day} ${thaiMonthsShort[month - 1]} (${weekdaysShort[d.getUTCDay()]})`,
      storefrontTotal: t.storefrontTotal,
      grab: t.grab,
      lineman: t.lineman,
      shopee: t.shopee,
      tiktok: c?.tiktok ?? 0,
      fbLine: c?.fbLine ?? 0,
      pickup: c?.pickup ?? 0,
      catering: c?.catering ?? 0,
      depositGrab: c?.depositGrab ?? null,
      depositLineman: c?.depositLineman ?? null,
      depositStorefront: c?.depositStorefront ?? null,
      depositEcom: c?.depositEcom ?? null,
      note: c?.note ?? null,
    });
  }

  // Matrix รายสาขา x รายวัน — แยกหน้าร้าน/Grab/Lineman ต่อวันต่อสาขา
  const branchDayDetail = new Map<
    string,
    {
      storefront: number;
      grab: number;
      lineman: number;
      shopee: number;
      cashPos: number | null;
      transfer: number | null;
      cashTransferCombined: number | null;
      cashCounted: number | null;
      posCheckTotal: number | null;
      note: string | null;
    }
  >();
  // สรุปรายสาขาทั้งเดือน แยกหน้าร้าน/Grab/Lineman — สำหรับ Ranking chart
  const branchMonthTotal = new Map<string, { storefront: number; grab: number; lineman: number; shopee: number }>();
  for (const r of salesRows) {
    const storefront = r.branch.type === "CASH" ? (r.cashPos ?? 0) + (r.transfer ?? 0) : r.cashTransferCombined ?? 0;
    branchDayDetail.set(`${r.branchId}_${r.date.toISOString().slice(0, 10)}`, {
      storefront,
      grab: r.grab,
      lineman: r.lineman,
      shopee: r.shopee,
      cashPos: r.cashPos,
      transfer: r.transfer,
      cashTransferCombined: r.cashTransferCombined,
      cashCounted: r.cashCounted,
      posCheckTotal: r.posCheckTotal,
      note: r.note,
    });

    const existing = branchMonthTotal.get(r.branchId) ?? { storefront: 0, grab: 0, lineman: 0, shopee: 0 };
    existing.storefront += storefront;
    existing.grab += r.grab;
    existing.lineman += r.lineman;
    existing.shopee += r.shopee;
    branchMonthTotal.set(r.branchId, existing);
  }
  const rankingRows = branches.map((b) => ({
    branchId: b.id,
    branchName: b.name,
    isActive: b.isActive,
    storefront: branchMonthTotal.get(b.id)?.storefront ?? 0,
    grab: branchMonthTotal.get(b.id)?.grab ?? 0,
    lineman: branchMonthTotal.get(b.id)?.lineman ?? 0,
    shopee: branchMonthTotal.get(b.id)?.shopee ?? 0,
  }));

  // สรุปยอดรวมทั้งเดือน แยกประเภทช่องทาง — สำหรับ Chart วงกลม (รูปแบบเดิม)
  let storefrontTotal = 0;
  let grabTotal = 0;
  let linemanTotal = 0;
  let shopeeTotal = 0;
  for (const r of salesRows) {
    storefrontTotal += r.branch.type === "CASH" ? (r.cashPos ?? 0) + (r.transfer ?? 0) : r.cashTransferCombined ?? 0;
    grabTotal += r.grab;
    linemanTotal += r.lineman;
    shopeeTotal += r.shopee;
  }
  let tiktokTotal = 0;
  let fbLineTotal = 0;
  let pickupTotal = 0;
  let cateringTotal = 0;
  for (const c of companyRows) {
    tiktokTotal += c.tiktok;
    fbLineTotal += c.fbLine;
    pickupTotal += c.pickup;
    cateringTotal += c.catering;
  }
  const ecomTotal = tiktokTotal + fbLineTotal + pickupTotal + cateringTotal;

  const eventTotal = (eventAgg._sum.storefront ?? 0) + (eventAgg._sum.grab ?? 0) + (eventAgg._sum.lineman ?? 0);

  const monthGrandTotal = storefrontTotal + grabTotal + linemanTotal + shopeeTotal + ecomTotal + eventTotal;

  // จำนวนวันที่ผ่านมาแล้วในเดือนนี้ (ถ้าเป็นเดือนที่ผ่านไปแล้ว = เต็มเดือน, ถ้าเป็นเดือนปัจจุบัน = นับถึงวันนี้)
  const daysElapsed = clampedEnd.getUTCDate();
  const avgDaily = monthGrandTotal / daysElapsed;
  const avgGrab = grabTotal / daysElapsed;
  const avgLineman = linemanTotal / daysElapsed;

  const channelSlices = [
    { label: "หน้าร้าน (Storefront)", value: storefrontTotal, color: CHART_COLORS.blue },
    { label: "Grab", value: grabTotal, color: CHART_COLORS.green },
    { label: "Lineman", value: linemanTotal, color: CHART_COLORS.magenta },
    ...(shopeeTotal ? [{ label: "Shopee", value: shopeeTotal, color: CHART_COLORS.orange }] : []),
    { label: "E-Commerce", value: ecomTotal, color: CHART_COLORS.yellow },
    { label: "Event ชั่วคราว", value: eventTotal, color: CHART_COLORS.aqua },
  ];
  const ecomSlices = [
    { label: "TikTok", value: tiktokTotal, color: CHART_COLORS.aqua },
    { label: "FB / Line", value: fbLineTotal, color: CHART_COLORS.orange },
    { label: "รับหน้าร้าน", value: pickupTotal, color: CHART_COLORS.violet },
    { label: "Catering", value: cateringTotal, color: CHART_COLORS.red },
  ];

  return (
    <>
      {isCurrentMonthView && (
        <div className="mt-4 flex justify-end">
          <BackgroundSync />
        </div>
      )}
      <div className="mb-6 mt-6 rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm font-medium text-gray-600">ยอดขายรวมทุกช่องทางเดือนนี้</p>
        <p className="mt-1 text-xl font-bold text-brand-700">{formatBaht(monthGrandTotal)}</p>
        {eventTotal > 0 && (
          <p className="mt-1 text-xs text-gray-400">รวม Event ชั่วคราว {formatBaht(eventTotal)} บาท</p>
        )}
      </div>

      <div className={`mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 ${shopeeTotal > 0 ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">เฉลี่ย/วัน (ทุกช่องทาง)</p>
          <p className="mt-1 text-base font-bold text-brand-700">{formatBaht(avgDaily)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">ยอดรวม Lineman</p>
          <p className="mt-1 text-base font-bold text-gray-800">{formatBaht(linemanTotal)}</p>
          <p className="mt-0.5 text-[11px] text-gray-400">เฉลี่ย {formatBaht(avgLineman)}/วัน</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">ยอดรวม Grab</p>
          <p className="mt-1 text-base font-bold text-gray-800">{formatBaht(grabTotal)}</p>
          <p className="mt-0.5 text-[11px] text-gray-400">เฉลี่ย {formatBaht(avgGrab)}/วัน</p>
        </div>
        {shopeeTotal > 0 && (
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
            <p className="text-xs text-orange-700">ยอดรวม Shopee</p>
            <p className="mt-1 text-base font-bold text-orange-800">{formatBaht(shopeeTotal)}</p>
            <p className="mt-0.5 text-[11px] text-orange-600">เฉลี่ย {formatBaht(shopeeTotal / daysElapsed)}/วัน</p>
          </div>
        )}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">ยอดรวมหน้าร้าน</p>
          <p className="mt-1 text-base font-bold text-gray-800">{formatBaht(storefrontTotal)}</p>
          <p className="mt-0.5 text-[11px] text-gray-400">เฉลี่ย {formatBaht(storefrontTotal / daysElapsed)}/วัน</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">ยอดรวม E-Commerce</p>
          <p className="mt-1 text-base font-bold text-gray-800">{formatBaht(ecomTotal)}</p>
          <p className="mt-0.5 text-[11px] text-gray-400">เฉลี่ย {formatBaht(ecomTotal / daysElapsed)}/วัน</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">สัดส่วนช่องทางการขาย (เดือนนี้)</h2>
          <DonutChart data={channelSlices} />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">สัดส่วน E-Commerce ย่อย (เดือนนี้)</h2>
          <DonutChart data={ecomSlices} />
        </div>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-gray-700">Ranking สาขา — เดือนนี้ (หน้าร้าน vs Delivery)</h2>
      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-5">
        <BranchRankingChart rows={rankingRows} />
      </div>

      <h2 className="mb-3 text-sm font-semibold text-gray-700">สรุปรายวัน — แก้ไข E-Commerce ได้ตรงนี้</h2>
      <EditableMonthlyChannelTable rows={dayRows} />

      <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700">
        ยอดขายรายสาขา — ดูทีละวัน แก้ไขหน้าร้าน/Grab/Lineman/เงินสดนับ/เช็คยอด POS ได้ตรงนี้เลย
      </h2>
      <BranchDailyMatrix
        branches={branches.map((b) => ({ id: b.id, code: b.code, name: b.name, isActive: b.isActive, type: b.type }))}
        dateKeys={dateKeys}
        dayLabels={Object.fromEntries(dateKeys.map((k, i) => [k, dayRows[i].dayLabel]))}
        detail={Object.fromEntries(branchDayDetail)}
        defaultDateKey={clampedEnd.toISOString().slice(0, 10)}
      />
    </>
  );
}
