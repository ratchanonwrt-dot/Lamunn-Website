import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@lamunn/db-finance";
import BackgroundSync from "@/components/BackgroundSync";
import { requireSectionPage } from "@/lib/permissions";
import MonthFilterBar from "@/components/MonthFilterBar";
import { monthRange } from "@/lib/dates";
import { formatBaht, formatPercent } from "@/lib/format";
import { getCashOnHand, getCreditTermOutstanding } from "@/lib/finance";
import { computeRent } from "@/lib/rentCalc";
import { queryGpRateHistories, applyGpRateHistories } from "@/lib/gpRateHistory";
import { computeYearOverview } from "@/lib/yearOverview";
import YearOverview from "./YearOverview";

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${accent ?? "text-gray-800"}`}>{value}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border border-gray-200 bg-white p-4">
            <div className="h-3 w-16 rounded bg-gray-100" />
            <div className="mt-3 h-4 w-20 rounded bg-gray-100" />
          </div>
        ))}
      </div>
      <div className="mt-8 h-4 w-32 rounded bg-gray-200" />
      <div className="mt-3 h-64 rounded-xl border border-gray-200 bg-white" />
    </div>
  );
}

// ส่วนหัวหน้า (ชื่อหน้า + ปุ่มเช็คยอด POS + ตัวกรองเดือน) ไม่ต้องรอข้อมูลหนักเลย — นับจำนวนสาขาด้วย query
// เล็กๆ แยกต่างหาก (นับแถวอย่างเดียว เร็วกว่า query ยอดขายทั้งหมดมาก) ให้ shell ขึ้นได้ทันทีก่อน sync
// POS + คำนวณยอดขายทั้ง 23+ สาขา (ส่วนที่หนักสุด) ซึ่งแยกไปอยู่ใน Suspense ด้านล่างแทน
export default async function DashboardPage({ searchParams }: { searchParams: { year?: string; month?: string } }) {
  await requireSectionPage("DASHBOARD");
  const now = new Date();
  const year = Number(searchParams.year) || now.getUTCFullYear();
  const month = Number(searchParams.month) || now.getUTCMonth() + 1;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">
          ภาพรวมยอดขาย
          {/* จำนวนสาขาอยู่ใน Suspense ของตัวเอง — เดิม await ตรงนี้ก่อน return ทำให้หัวหน้า+ตัวกรองเดือน
              ต้องรอ DB หนึ่งรอบก่อนจะโชว์อะไรได้เลย ตอนนี้ shell ขึ้นทันที ตัวเลขตามมาเอง */}
          <Suspense fallback={null}>
            <ActiveBranchCount />
          </Suspense>
        </h1>
        <Link href="/reconciliation" className="text-xs font-medium text-gray-400 underline-offset-2 hover:text-brand-600 hover:underline">
          เช็คยอด POS →
        </Link>
      </div>

      {/* ภาพรวมทั้งปีอยู่บนสุด — ดูยอดสะสมและแนวโน้มทั้งปีก่อน แล้วค่อยลงรายละเอียดรายเดือนด้านล่าง */}
      <Suspense fallback={<div className="mb-8 h-72 animate-pulse rounded-xl border border-gray-200 bg-white" />}>
        <YearSection year={year} month={month} />
      </Suspense>

      <h2 className="mb-3 text-base font-bold text-gray-800">รายละเอียดรายเดือน</h2>
      <MonthFilterBar basePath="/dashboard" year={year} month={month} />

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardData year={year} month={month} />
      </Suspense>
    </div>
  );
}

async function YearSection({ year, month }: { year: number; month: number }) {
  const data = await computeYearOverview(year);
  return <YearOverview d={data} month={month} />;
}

async function ActiveBranchCount() {
  const activeBranchCount = await prisma.branch.count({ where: { isActive: true } });
  return <> — {activeBranchCount} สาขา</>;
}

async function DashboardData({ year, month }: { year: number; month: number }) {
  const now = new Date();
  const { start, end } = monthRange(year, month - 1);
  const clampedEnd = end > now ? now : end;

  // ดึงข้อมูลจากระบบ POS/IMS ของเพื่อนมาเติมอัตโนมัติ (เฉพาะสาขา/วันที่ที่เชื่อมไว้แล้ว)
  // sync เฉพาะช่วง 4 วันล่าสุดของเดือนปัจจุบัน (ไม่ใช่ทั้งเดือน) เพื่อให้หน้าโหลดเร็ว — ข้อมูลเก่ากว่านั้น
  // cron อัตโนมัติทุกตี 04:00 ดึงให้ครบอยู่แล้ว ไม่ต้อง sync ซ้ำทุกครั้งที่เข้าหน้า
  // ไม่ sync ตรงนี้แล้ว — การยิง HTTP ไป Supabase ของระบบ POS อีกโปรเจกต์กลางการ render
  // ทำให้หน้าค้างรอทุกครั้งที่เปิด ย้ายไปให้ <BackgroundSync /> เรียกหลังหน้าแสดงผลเสร็จแทน
  // (ตัวเลขขึ้นทันทีจากฐานข้อมูล แล้วรีเฟรชเองถ้า POS มีของใหม่ ส่วน cron ตี 04:00 ยังดึงครบเหมือนเดิม)
  const isCurrentMonthView = year === now.getUTCFullYear() && month === now.getUTCMonth() + 1;

  // ไม่กรอง isActive — สาขาที่ปิดไปแล้วต้องยังเห็นยอดขายย้อนหลังของเดือนที่เคยเปิดอยู่
  // ทุก query ด้านล่างนี้เป็นอิสระจากกันหมด (ไม่มีตัวไหนต้องรอผลลัพธ์ของอีกตัว) ยิงพร้อมกันทีเดียวแทนที่จะแยก
  // เป็น 3 รอบ sequential (สาขา/ยอดขาย → gpRateHistory → cashOnHand/creditTerm) เพื่อลดจำนวนรอบไปกลับกับ DB
  const [branches, salesAgg, companyAgg, eventAgg, gpHistories, cashOnHand, creditTermOutstanding] = await Promise.all([
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, include: { rentConfig: true } }),
    prisma.dailySales.groupBy({
      by: ["branchId"],
      where: { date: { gte: start, lte: end } },
      _sum: { cashPos: true, transfer: true, cashTransferCombined: true, grab: true, lineman: true, shopee: true },
    }),
    prisma.companyChannelDaily.aggregate({
      where: { date: { gte: start, lte: end } },
      _sum: { tiktok: true, fbLine: true, pickup: true, catering: true },
    }),
    prisma.eventSale.aggregate({
      where: { startDate: { gte: start, lte: end } },
      _sum: { storefront: true, grab: true, lineman: true },
    }),
    queryGpRateHistories(year, month),
    getCashOnHand(),
    getCreditTermOutstanding(),
  ]);
  const salesByBranch = new Map(salesAgg.map((s) => [s.branchId, s._sum]));
  const ecomTotal =
    (companyAgg._sum.tiktok ?? 0) + (companyAgg._sum.fbLine ?? 0) + (companyAgg._sum.pickup ?? 0) + (companyAgg._sum.catering ?? 0);
  const eventTotal = (eventAgg._sum.storefront ?? 0) + (eventAgg._sum.grab ?? 0) + (eventAgg._sum.lineman ?? 0);

  const baseRates = new Map(
    branches.filter((b) => b.rentConfig).map((b) => [b.id, { gpPercentStorefront: b.rentConfig!.gpPercentStorefront, gpPercentDelivery: b.rentConfig!.gpPercentDelivery }])
  );
  const effectiveRates = applyGpRateHistories(baseRates, gpHistories);

  const rows = branches.map((b) => {
    const s = salesByBranch.get(b.id);
    const storefront = b.type === "CASH" ? (s?.cashPos ?? 0) + (s?.transfer ?? 0) : s?.cashTransferCombined ?? 0;
    // ค่าเช่า/GP ฝั่ง Delivery คิดจาก Grab + Lineman เท่านั้น — Shopee (เริ่ม 30 ต.ค. 2569) ยังไม่ได้ตกลงว่าห้างคิด GP ด้วยไหม
    // จึงนับเข้ายอดขายรวม/Delivery ที่แสดง แต่ไม่ส่งเข้าสูตรค่าเช่า
    const deliveryForRent = (s?.grab ?? 0) + (s?.lineman ?? 0);
    const delivery = deliveryForRent + (s?.shopee ?? 0);
    const total = storefront + delivery;

    const rate = effectiveRates.get(b.id);
    const rent = b.rentConfig ? computeRent({ ...b.rentConfig, ...rate }, storefront, deliveryForRent).rentAmount : 0;

    return { branch: b, storefront, delivery, total, rent };
  });

  const totalStorefront = rows.reduce((a, r) => a + r.storefront, 0);
  const totalDelivery = rows.reduce((a, r) => a + r.delivery, 0);
  const totalRent = rows.reduce((a, r) => a + r.rent, 0);
  const grandTotal = totalStorefront + totalDelivery + ecomTotal + eventTotal;

  return (
    <>
      {isCurrentMonthView && (
        <div className="mb-3 flex justify-end">
          <BackgroundSync />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="ยอดขายรวมทั้งหมด" value={formatBaht(grandTotal)} accent="text-brand-700" />
        <StatCard label="หน้าร้าน (Storefront)" value={formatBaht(totalStorefront)} />
        <StatCard label="Delivery (Grab+Lineman+Shopee)" value={formatBaht(totalDelivery)} />
        <StatCard label="E-Commerce" value={formatBaht(ecomTotal)} />
        <StatCard label="Event ชั่วคราว" value={formatBaht(eventTotal)} />
        <StatCard label="ค่าเช่ารวม (ประมาณการ)" value={formatBaht(totalRent)} />
        <StatCard label="Credit Term ค้างห้าง" value={formatBaht(creditTermOutstanding)} accent="text-amber-600" />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard label="เงินสดสะสมในมือ (ครัวกลาง)" value={`${formatBaht(cashOnHand.balance)} บาท`} accent="text-violet-600" />
        <StatCard
          label="ยอดยกมาก่อนเริ่มระบบ"
          value={`${formatBaht(cashOnHand.openingBalance)} บาท`}
        />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700">ยอดขายรายสาขา</h2>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2">No.</th>
              <th className="px-3 py-2">สาขา</th>
              <th className="px-3 py-2">ประเภท</th>
              <th className="px-3 py-2 text-right">หน้าร้าน</th>
              <th className="px-3 py-2 text-right">Delivery</th>
              <th className="px-3 py-2 text-right">รวม</th>
              <th className="px-3 py-2 text-right">%หน้าร้าน</th>
              <th className="px-3 py-2 text-right">%Delivery</th>
              <th className="px-3 py-2 text-right">ค่าเช่า (ประมาณการ)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.branch.id} className="border-t border-gray-100">
                <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                <td className="px-3 py-2 font-medium text-gray-800">
                  {r.branch.name}
                  {!r.branch.isActive && <span className="ml-1.5 text-xs font-normal text-gray-400">(ปิดสาขาแล้ว)</span>}
                </td>
                <td className="px-3 py-2 text-gray-500">{r.branch.type === "CREDIT_TERM" ? "Credit Term" : "เงินสด"}</td>
                <td className="px-3 py-2 text-right">{formatBaht(r.storefront)}</td>
                <td className="px-3 py-2 text-right">{formatBaht(r.delivery)}</td>
                <td className="px-3 py-2 text-right font-medium">{formatBaht(r.total)}</td>
                <td className="px-3 py-2 text-right text-gray-500">{r.total ? formatPercent(r.storefront / r.total) : "-"}</td>
                <td className="px-3 py-2 text-right text-gray-500">{r.total ? formatPercent(r.delivery / r.total) : "-"}</td>
                <td className="px-3 py-2 text-right text-gray-500">{formatBaht(r.rent)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
              <td className="px-3 py-2" colSpan={3}>
                รวมทั้งหมด (+ E-Commerce {formatBaht(ecomTotal)} + Event {formatBaht(eventTotal)})
              </td>
              <td className="px-3 py-2 text-right">{formatBaht(totalStorefront)}</td>
              <td className="px-3 py-2 text-right">{formatBaht(totalDelivery)}</td>
              <td className="px-3 py-2 text-right">{formatBaht(grandTotal)}</td>
              <td className="px-3 py-2" colSpan={2}></td>
              <td className="px-3 py-2 text-right">{formatBaht(totalRent)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
