import { Suspense } from "react";
import { prisma } from "@lamunn/db-finance";
import { requireSectionPage } from "@/lib/permissions";
import MonthFilterBar from "@/components/MonthFilterBar";
import RentPaymentChecklist from "@/components/RentPaymentChecklist";
import MinimumPaidToggle from "@/components/MinimumPaidToggle";
import ExportPanel from "@/components/ExportPanel";
import { ChevronDown } from "lucide-react";
import { monthRange } from "@/lib/dates";
import { formatBaht, formatPercent } from "@/lib/format";
import { computeRent, type RentResult } from "@/lib/rentCalc";
import { getEffectiveGpRates } from "@/lib/gpRateHistory";

type PaymentStatus = "PENDING" | "TRANSFER_SCHEDULED" | "PAID_AWAITING_BILL" | "RECEIPT_RECEIVED";

type Row = RentResult & {
  branch: { id: string; name: string; isActive: boolean; type: "CASH" | "CREDIT_TERM" };
  storefront: number;
  delivery: number;
  rentType: "FIX_RATE" | "GP";
  gpPercentStorefront: number;
  gpPercentDelivery: number;
  minAmount: number | null;
  minimumExcludesDelivery: boolean;
  paymentStatus: PaymentStatus;
  minimumPaid: boolean;
  netOutstanding: number; // ยอดที่ยังต้องจ่ายจริง — ถ้าจ่าย Minimum ให้ห้างไปแล้ว จะเหลือแค่ส่วนเกิน Minimum
  year: number;
  month: number;
};

function PayBadge({ type }: { type: "CASH" | "CREDIT_TERM" }) {
  return type === "CREDIT_TERM" ? (
    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600">หักจาก Credit Term</span>
  ) : (
    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-600">จ่ายเองสิ้นเดือน</span>
  );
}

function BranchCard({ r }: { r: Row }) {
  const total = r.storefront + r.delivery;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="font-semibold text-gray-800">
          {r.branch.name}
          {!r.branch.isActive && <span className="ml-1.5 text-xs font-normal text-gray-400">(ปิดสาขาแล้ว)</span>}
        </p>
        <PayBadge type={r.branch.type} />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs text-gray-500">
        <span>ยอดขายรวม: <span className="font-medium text-gray-700">{formatBaht(total)}</span></span>
        {r.rentType === "GP" && (
          <span>GP หน้าร้าน/Delivery: <span className="font-medium text-gray-700">{formatPercent(r.gpPercentStorefront)} / {formatPercent(r.gpPercentDelivery)}</span></span>
        )}
      </div>

      {r.rentType === "GP" && r.minimumExcludesDelivery && (
        <p className="mb-2 text-[11px] text-gray-400">
          * Minimum คิดจากยอดหน้าร้านอย่างเดียว — GP Delivery {formatBaht(r.deliveryGpAmount)} บาท บวกเพิ่มเสมอ
        </p>
      )}

      {r.minimumApplied ? (
        <div className="rounded-lg bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-700">
            {r.minimumExcludesDelivery ? "ยอดหน้าร้านยังไม่ถึง Minimum — ใช้ Minimum แทน GP หน้าร้าน" : "ยังไม่ถึง Minimum — ใช้ยอด Minimum แทน GP"}
          </p>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="text-xs text-gray-500">{r.minimumExcludesDelivery ? "ค่าเช่าจาก GP หน้าร้านล้วนๆ จะได้แค่" : "ค่าเช่าจาก GP ล้วนๆ จะได้แค่"}</span>
            <span className="text-sm text-gray-600">{formatBaht(r.minimumExcludesDelivery ? r.storefrontGpAmount : r.gpAmount)}</span>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between">
            <span className="text-xs text-gray-500">แต่ Minimum กำหนดไว้</span>
            <span className="text-sm font-semibold text-amber-700">{formatBaht(r.minAmount ?? 0)}</span>
          </div>
          {r.minimumExcludesDelivery && r.deliveryGpAmount > 0 && (
            <div className="mt-0.5 flex items-baseline justify-between">
              <span className="text-xs text-gray-500">+ GP Delivery (บวกเพิ่มเสมอ)</span>
              <span className="text-sm font-semibold text-gray-700">{formatBaht(r.deliveryGpAmount)}</span>
            </div>
          )}
          <div className="mt-2 border-t border-amber-100 pt-2 text-xs text-gray-600">
            {r.minimumExcludesDelivery ? (
              <>
                รวมค่าเช่า = Minimum {formatBaht(r.minAmount ?? 0)} + GP Delivery {formatBaht(r.deliveryGpAmount)} ={" "}
                <span className="font-semibold text-amber-700">{formatBaht(r.rentAmount)}</span>
                <br />
                เท่ากับ GP หน้าร้านจริงที่จ่ายออกมา{" "}
                <span className="font-semibold text-amber-700">{formatPercent(r.effectiveGpPercent)}</span> ของยอดขายหน้าร้าน (ปกติ {formatPercent(r.gpPercentStorefront)})
              </>
            ) : (
              <>
                ขายได้ {formatBaht(total)} จ่ายเท่า Minimum {formatBaht(r.minAmount ?? 0)} → เท่ากับ GP จริง{" "}
                <span className="font-semibold text-amber-700">{formatPercent(r.effectiveGpPercent)}</span> ของยอดขาย
              </>
            )}
          </div>
          <div className="mt-1.5 text-xs text-gray-400">
            ต้องขายหน้าร้านเพิ่มอีก {formatBaht(r.salesGapToMinimum)} บาท ถึงจะถึง Minimum ด้วย GP ล้วนๆ
          </div>
          {r.branch.type === "CREDIT_TERM" && (
            <div className="mt-2 border-t border-amber-100 pt-2 text-xs">
              <div className="flex items-baseline justify-between text-gray-500">
                <span>หักผ่าน Credit Term อัตโนมัติ (ตาม GP จริง)</span>
                <span className="font-medium text-gray-700">{formatBaht(r.gpAmount)}</span>
              </div>
              <div className="mt-0.5 flex items-baseline justify-between text-rose-600">
                <span>ส่วนต่างต้องเรียกเก็บเองแยก (ไม่หักผ่าน Credit Term)</span>
                <span className="font-semibold">{formatBaht(r.rentAmount - r.gpAmount)}</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className={`rounded-lg px-3 py-2 ${r.rentType === "GP" && r.minAmount ? "bg-emerald-50" : "bg-gray-50"}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${r.rentType === "GP" && r.minAmount ? "text-emerald-700" : "text-gray-500"}`}>
              {r.rentType === "FIX_RATE" ? "ค่าเช่าคงที่/เดือน" : r.minAmount ? "✓ ผ่าน Minimum แล้ว — จ่ายตาม GP" : "จ่ายตาม GP (ไม่มี Minimum)"}
            </span>
            <span className="text-lg font-bold text-brand-700">{formatBaht(r.rentAmount)}</span>
          </div>
          {r.rentType === "GP" && r.minimumExcludesDelivery && r.deliveryGpAmount > 0 && (
            <p className="mt-1 text-[11px] text-gray-400">
              (หน้าร้าน {formatBaht(r.storefrontGpAmount)} + Delivery {formatBaht(r.deliveryGpAmount)})
            </p>
          )}
        </div>
      )}

      {r.minAmount ? (
        <div className="mt-2 border-t border-gray-100 pt-2">
          <MinimumPaidToggle branchId={r.branch.id} year={r.year} month={r.month} minimumPaid={r.minimumPaid} />
          <div className="mt-1.5 flex items-baseline justify-between text-xs">
            <span className="text-gray-500">ค้างจ่ายจริง (net)</span>
            <span className={`font-semibold ${r.netOutstanding > 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatBaht(r.netOutstanding)}</span>
          </div>
        </div>
      ) : null}

      <RentPaymentChecklist branchId={r.branch.id} year={r.year} month={r.month} status={r.paymentStatus} />
    </div>
  );
}

function RentSkeleton() {
  return (
    <div className="mt-3 animate-pulse">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl border border-gray-200 bg-white" />
        ))}
      </div>
      <div className="mt-6 h-48 rounded-xl border border-gray-200 bg-white" />
    </div>
  );
}

// หัวหน้า (ชื่อหน้า + Export + ตัวกรองเดือน) ไม่ต้องรอ query ค่าเช่า/ยอดขายทั้ง 23+ สาขาเลย ให้ shell ขึ้นก่อนได้
export default async function RentPage({ searchParams }: { searchParams: { year?: string; month?: string } }) {
  await requireSectionPage("RENT");
  const now = new Date();
  const year = Number(searchParams.year) || now.getUTCFullYear();
  const month = Number(searchParams.month) || now.getUTCMonth() + 1;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-800">ค่าเช่า — แยกประเภทชัดเจน</h1>
        <ExportPanel
          apiPath="/api/export/rent"
          extraParams={{ year: String(year), month: String(month) }}
          options={[
            { key: "sales", label: "ยอดขาย (หน้าร้าน/Delivery)" },
            { key: "rentConfig", label: "รายละเอียดค่าเช่า (ประเภท/GP%/Minimum)" },
            { key: "rentAmount", label: "ค่าเช่าประมาณการ" },
            { key: "minimumPaid", label: "สถานะจ่าย Minimum / ค้างจ่ายจริง" },
            { key: "paymentStatus", label: "สถานะการจ่ายค่าเช่า" },
          ]}
        />
      </div>

      <MonthFilterBar basePath="/rent" year={year} month={month} />

      <Suspense fallback={<RentSkeleton />}>
        <RentData year={year} month={month} />
      </Suspense>
    </div>
  );
}

async function RentData({ year, month }: { year: number; month: number }) {
  const { start, end } = monthRange(year, month - 1);

  // ไม่กรอง isActive — สาขาที่ปิดไปแล้วต้องยังเห็นค่าเช่าของเดือนที่เคยเปิดอยู่
  const branches = await prisma.branch.findMany({
    orderBy: { sortOrder: "asc" },
    include: { rentConfig: true },
  });

  // getEffectiveGpRates ใช้แค่ branches (ดึงมาแล้วด้านบน) กับ year/month — ไม่ได้ขึ้นกับ salesAgg/paymentRows
  // เลย ยิงพร้อมกันได้ในรอบเดียวกัน แทนที่จะรอ Promise.all ด้านล่างเสร็จก่อนแล้วค่อยยิงแยกอีกรอบ
  const baseRates = new Map(
    branches.filter((b) => b.rentConfig).map((b) => [b.id, { gpPercentStorefront: b.rentConfig!.gpPercentStorefront, gpPercentDelivery: b.rentConfig!.gpPercentDelivery }])
  );

  const [salesAgg, paymentRows, effectiveRates] = await Promise.all([
    prisma.dailySales.groupBy({
      by: ["branchId"],
      where: { date: { gte: start, lte: end } },
      _sum: { cashPos: true, transfer: true, cashTransferCombined: true, grab: true, lineman: true },
    }),
    prisma.rentPayment.findMany({ where: { year, month } }),
    getEffectiveGpRates(year, month, baseRates),
  ]);
  const salesByBranch = new Map(salesAgg.map((s) => [s.branchId, s._sum]));
  const paymentByBranch = new Map(paymentRows.map((p) => [p.branchId, { status: p.status as PaymentStatus, minimumPaid: p.minimumPaid }]));

  // นับค่าเช่าเฉพาะสาขาที่เปิดจริงในเดือนนั้น (มียอดขาย) — สาขาที่ยังไม่เปิด/ปิดไปแล้วมีค่าเช่าคงที่หรือขั้นต่ำค้างอยู่ในตั้งค่า
  // ถ้าไม่กรอง ยอดรวมจะนับค่าเช่าที่ไม่ได้จ่ายจริงเข้าไปด้วย (เช่น ส.ค. 2569 มี 6 สาขายังไม่เปิดแต่ถูกคิดเต็มเดือน 150,000)
  const rows: Row[] = branches
    .filter((b) => b.rentConfig)
    .filter((b) => {
      const s = salesByBranch.get(b.id);
      return (s?.cashPos ?? 0) + (s?.transfer ?? 0) + (s?.cashTransferCombined ?? 0) + (s?.grab ?? 0) + (s?.lineman ?? 0) > 0;
    })
    .map((b) => {
      const s = salesByBranch.get(b.id);
      const storefront = b.type === "CASH" ? (s?.cashPos ?? 0) + (s?.transfer ?? 0) : s?.cashTransferCombined ?? 0;
      const delivery = (s?.grab ?? 0) + (s?.lineman ?? 0);
      const rate = effectiveRates.get(b.id)!;
      const result = computeRent({ ...b.rentConfig!, ...rate }, storefront, delivery);
      const payment = paymentByBranch.get(b.id) ?? { status: "PENDING" as PaymentStatus, minimumPaid: false };
      const minAmount = b.rentConfig!.minAmount;
      // ห้างบางสาขาเก็บ Minimum ก่อน ส่วนเกิน Minimum ค่อยจ่ายเดือนถัดไป — ถ้าจ่าย Minimum ไปแล้ว
      // ยอดที่ยังค้างจริงเหลือแค่ส่วนเกิน (rentAmount - minAmount) ไม่ใช่ rentAmount เต็มก้อน — ใช้ rentAmount
      // (ไม่ใช่ gpAmount รวม) เพราะสาขาที่ minimumExcludesDelivery=true ยังมี GP Delivery ที่ไม่เกี่ยวกับ
      // Minimum เลย ต้องยังคงค้างอยู่เสมอไม่ว่า Minimum จะจ่ายไปแล้วหรือไม่
      const netOutstanding = minAmount && payment.minimumPaid ? Math.max(0, result.rentAmount - minAmount) : result.rentAmount;
      return {
        ...result,
        branch: { id: b.id, name: b.name, isActive: b.isActive, type: b.type },
        storefront,
        delivery,
        rentType: b.rentConfig!.rentType,
        gpPercentStorefront: rate.gpPercentStorefront,
        gpPercentDelivery: rate.gpPercentDelivery,
        minAmount,
        minimumExcludesDelivery: b.rentConfig!.minimumExcludesDelivery,
        paymentStatus: payment.status,
        minimumPaid: payment.minimumPaid,
        netOutstanding,
        year,
        month,
      };
    });

  const totalRent = rows.reduce((a, r) => a + r.rentAmount, 0);
  const belowMinimumRows = rows.filter((r) => r.minimumApplied);
  const fixRateRows = rows.filter((r) => r.rentType === "FIX_RATE");
  // สาขาที่มี Minimum อยู่รวมกันก้อนเดียวเสมอ ไม่ว่าจะยังไม่ถึงหรือผ่านแล้ว — ผ่านแล้วก็ไม่ต้องย้ายไปกลุ่มอื่น
  // แค่ขึ้นสถานะ (เขียว/เหลือง) ต่างกันใน BranchCard เอง แยกกลุ่มจริงแค่ "มี Minimum" กับ "ไม่มี Minimum"
  const withMinimumRows = rows.filter((r) => r.rentType === "GP" && r.minAmount);
  const noMinimumRows = rows.filter((r) => r.rentType === "GP" && !r.minAmount);
  const cashRows = rows.filter((r) => r.branch.type === "CASH");
  const creditTermRows = rows.filter((r) => r.branch.type === "CREDIT_TERM");

  // Credit Term หักให้อัตโนมัติแค่ตามยอด GP จริง (gpAmount) เท่านั้น — ถ้าไม่ถึง Minimum ส่วนต่างไม่ถูกหักผ่าน
  // Credit Term อัตโนมัติ ต้องไปเรียกเก็บแยกเหมือนสาขาเงินสด (ยังไงก็ต้องได้ครบ Minimum)
  const creditTermDeductTotal = rows
    .filter((r) => r.branch.type === "CREDIT_TERM")
    .reduce((a, r) => a + (r.minimumApplied ? r.gpAmount : r.rentAmount), 0);
  // สาขาที่ติ๊ก "จ่าย Minimum ไปแล้ว" ไว้แล้ว ไม่ต้องนับส่วนต่างนี้ซ้ำอีก (จ่ายไปแล้วจริง ไม่ใช่ยอดค้าง)
  const minimumGapNotViaCreditTerm = rows
    .filter((r) => r.branch.type === "CREDIT_TERM" && r.minimumApplied && !r.minimumPaid)
    .reduce((a, r) => a + (r.rentAmount - r.gpAmount), 0);
  // ใช้ netOutstanding แทน rentAmount — สาขาเงินสดที่จ่าย Minimum ไปแล้วจะเหลือแค่ส่วนเกิน (หรือ 0 ถ้ายังไม่ถึง Minimum)
  const payMonthEndTotal =
    rows.filter((r) => r.branch.type === "CASH").reduce((a, r) => a + r.netOutstanding, 0) + minimumGapNotViaCreditTerm;
  // "ค้างจ่ายจริง" = เงินที่เราต้องควักจ่ายเองจริงๆ เท่านั้น — สาขา Credit Term ไม่นับ (ห้างหักจากยอดขายที่โอนเข้าบัญชีให้อัตโนมัติอยู่แล้ว)
  // ยกเว้นส่วนต่างที่ไม่ถึง Minimum ซึ่งห้างหักให้ไม่ครบ ต้องเรียกเก็บเพิ่มเอง
  const netOutstandingTotal = payMonthEndTotal;

  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">ค่าเช่ารวมเดือนนี้ (ประมาณการ)</p>
          <p className="mt-1 text-lg font-bold text-brand-700">{formatBaht(totalRent)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">หักจาก Credit Term</p>
          <p className="mt-1 text-lg font-bold text-indigo-600">{formatBaht(creditTermDeductTotal)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">ต้องจ่ายเองสิ้นเดือน</p>
          <p className="mt-1 text-lg font-bold text-rose-600">{formatBaht(payMonthEndTotal)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">ยังไม่ถึง Minimum</p>
          <p className="mt-1 text-lg font-bold text-amber-600">{belowMinimumRows.length} สาขา</p>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-brand-200 bg-brand-50 p-4">
        <p className="text-xs font-medium text-brand-700">ค้างจ่ายจริงสุทธิ (net) — หลังหักส่วนที่จ่าย Minimum ให้ห้างไปแล้ว</p>
        <p className="mt-1 text-2xl font-bold text-brand-700">{formatBaht(netOutstandingTotal)} บาท</p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 text-xs">
        <span className="font-semibold text-gray-700">สถานะการจ่ายค่าเช่าเดือนนี้:</span>
        <span className="text-gray-500">
          ยังไม่จ่าย <span className="font-semibold text-gray-700">{rows.filter((r) => r.paymentStatus === "PENDING").length}</span>
        </span>
        <span className="text-gray-500">
          ตั้งโอนแล้ว <span className="font-semibold text-gray-700">{rows.filter((r) => r.paymentStatus === "TRANSFER_SCHEDULED").length}</span>
        </span>
        <span className="text-gray-500">
          จ่ายแล้วรอบิล <span className="font-semibold text-gray-700">{rows.filter((r) => r.paymentStatus === "PAID_AWAITING_BILL").length}</span>
        </span>
        <span className="text-emerald-600">
          ได้รับใบเสร็จแล้ว{" "}
          <span className="font-semibold">{rows.filter((r) => r.paymentStatus === "RECEIPT_RECEIVED").length}</span> / {rows.length}
        </span>
      </div>

      <details className="group mb-8 rounded-xl border border-gray-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 [&::-webkit-details-marker]:hidden">
          ค่าเช่าแบบ GP% — มี Minimum ({withMinimumRows.length})
          <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid grid-cols-1 gap-3 border-t border-gray-100 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {withMinimumRows.map((r) => (
            <BranchCard key={r.branch.id} r={r} />
          ))}
          {withMinimumRows.length === 0 && <p className="text-sm text-gray-400">ไม่มีสาขาในกลุ่มนี้</p>}
        </div>
      </details>

      <details className="group mb-8 rounded-xl border border-gray-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 [&::-webkit-details-marker]:hidden">
          ค่าเช่าแบบ GP% — ไม่มี Minimum ({noMinimumRows.length})
          <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid grid-cols-1 gap-3 border-t border-gray-100 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {noMinimumRows.map((r) => (
            <BranchCard key={r.branch.id} r={r} />
          ))}
          {noMinimumRows.length === 0 && <p className="text-sm text-gray-400">ไม่มีสาขาในกลุ่มนี้</p>}
        </div>
      </details>

      <details className="group mb-8 rounded-xl border border-gray-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 [&::-webkit-details-marker]:hidden">
          ค่าเช่าคงที่ (Fix Rate) ({fixRateRows.length})
          <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid grid-cols-1 gap-3 border-t border-gray-100 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {fixRateRows.map((r) => (
            <BranchCard key={r.branch.id} r={r} />
          ))}
          {fixRateRows.length === 0 && <p className="text-sm text-gray-400">ไม่มีสาขาในกลุ่มนี้</p>}
        </div>
      </details>

      <details className="group mb-8 rounded-xl border border-gray-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 [&::-webkit-details-marker]:hidden">
          สรุป GP% รายสาขา — หน้าร้าน / Delivery
          <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="overflow-x-auto border-t border-gray-100">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2">สาขา</th>
              <th className="px-3 py-2">ประเภทค่าเช่า</th>
              <th className="px-3 py-2 text-right">GP หน้าร้าน %</th>
              <th className="px-3 py-2 text-right">ค่าเช่าจาก GP หน้าร้าน</th>
              <th className="px-3 py-2 text-right">GP Delivery %</th>
              <th className="px-3 py-2 text-right">ค่าเช่าจาก GP Delivery</th>
              <th className="px-3 py-2 text-right">ค่าเช่ารวม (ประมาณการ)</th>
            </tr>
          </thead>
          <tbody>
            {([
              { label: "จ่ายเองสิ้นเดือน", group: cashRows },
              { label: "หักจาก Credit Term", group: creditTermRows },
            ] as const).map(({ label, group }) =>
              group.length > 0 ? (
                <>
                  <tr key={`${label}-header`} className="border-t border-gray-200 bg-gray-50">
                    <td className="px-3 py-1.5 text-xs font-semibold text-gray-500" colSpan={7}>
                      {label} ({group.length} สาขา)
                    </td>
                  </tr>
                  {group.map((r) => (
                    <tr key={r.branch.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-medium text-gray-800">
                        {r.branch.name}
                        {!r.branch.isActive && <span className="ml-1.5 text-xs font-normal text-gray-400">(ปิด)</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-500">{r.rentType === "GP" ? "GP%" : "Fix Rate"}</td>
                      {r.rentType === "GP" ? (
                        <>
                          <td className="px-3 py-2 text-right text-gray-700">{formatPercent(r.gpPercentStorefront)}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{formatBaht(r.storefrontGpAmount)}</td>
                          <td className="px-3 py-2 text-right text-gray-700">{formatPercent(r.gpPercentDelivery)}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{formatBaht(r.deliveryGpAmount)}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 text-right text-gray-300">-</td>
                          <td className="px-3 py-2 text-right text-gray-300">-</td>
                          <td className="px-3 py-2 text-right text-gray-300">-</td>
                          <td className="px-3 py-2 text-right text-gray-300">-</td>
                        </>
                      )}
                      <td className="px-3 py-2 text-right font-semibold text-brand-700">{formatBaht(r.rentAmount)}</td>
                    </tr>
                  ))}
                </>
              ) : null
            )}
          </tbody>
        </table>
        </div>
      </details>

      <details className="group rounded-xl border border-gray-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 [&::-webkit-details-marker]:hidden">
          ✅ เช็คลิสต์การจ่ายค่าเช่าเดือนนี้
          <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid grid-cols-1 gap-4 border-t border-gray-100 p-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-rose-700">จ่ายเองสิ้นเดือน ({cashRows.length} สาขา)</h3>
          <div className="flex flex-col gap-3">
            {cashRows.map((r) => (
              <div key={r.branch.id} className="rounded-lg border border-gray-100 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-800">
                    {r.branch.name}
                    {!r.branch.isActive && <span className="ml-1 text-[10px] font-normal text-gray-400">(ปิด)</span>}
                  </p>
                  <div className="text-right">
                    <p className="text-sm font-bold text-brand-700">{formatBaht(r.netOutstanding)}</p>
                    {r.netOutstanding !== r.rentAmount && <p className="text-[10px] text-gray-400">(รวม {formatBaht(r.rentAmount)})</p>}
                  </div>
                </div>
                {r.minAmount ? <MinimumPaidToggle branchId={r.branch.id} year={r.year} month={r.month} minimumPaid={r.minimumPaid} /> : null}
                <RentPaymentChecklist branchId={r.branch.id} year={r.year} month={r.month} status={r.paymentStatus} compact />
              </div>
            ))}
            {cashRows.length === 0 && <p className="text-sm text-gray-400">ไม่มีสาขาในกลุ่มนี้</p>}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-indigo-700">หักจาก Credit Term ({creditTermRows.length} สาขา)</h3>
          <div className="flex flex-col gap-3">
            {creditTermRows.map((r) => (
              <div key={r.branch.id} className="rounded-lg border border-gray-100 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-800">
                    {r.branch.name}
                    {!r.branch.isActive && <span className="ml-1 text-[10px] font-normal text-gray-400">(ปิด)</span>}
                  </p>
                  <div className="text-right">
                    <p className="text-sm font-bold text-brand-700">{formatBaht(r.netOutstanding)}</p>
                    {r.netOutstanding !== r.rentAmount && <p className="text-[10px] text-gray-400">(รวม {formatBaht(r.rentAmount)})</p>}
                  </div>
                </div>
                {r.minAmount ? <MinimumPaidToggle branchId={r.branch.id} year={r.year} month={r.month} minimumPaid={r.minimumPaid} /> : null}
                <RentPaymentChecklist branchId={r.branch.id} year={r.year} month={r.month} status={r.paymentStatus} compact />
              </div>
            ))}
            {creditTermRows.length === 0 && <p className="text-sm text-gray-400">ไม่มีสาขาในกลุ่มนี้</p>}
          </div>
        </div>
        </div>
      </details>
    </>
  );
}
