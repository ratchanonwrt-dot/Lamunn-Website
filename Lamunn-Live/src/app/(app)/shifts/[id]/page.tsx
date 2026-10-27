import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { prisma } from "@lamunn/db-live";
import { requirePageRole } from "@/lib/requirePageRole";
import { getPaySettings } from "@/lib/paySettings";
import { computePay, applyOverride } from "@/lib/pay";
import { toRange, isoDate, weekStartOf } from "@/lib/schedule";
import { formatBaht, formatHours, formatNum, formatThaiDate, slotHours, thaiDays } from "@/lib/format";
import ShiftResultsForm from "@/components/ShiftResultsForm";
import ShiftEditForm from "@/components/ShiftEditForm";
import DeleteShiftButton from "@/components/DeleteShiftButton";
import ShiftPayOverride from "@/components/ShiftPayOverride";
import ShiftOrdersForm from "@/components/ShiftOrdersForm";

export default async function ShiftDetailPage({ params }: { params: { id: string } }) {
  await requirePageRole();

  const shift = await prisma.liveShift.findUnique({
    where: { id: params.id },
    include: {
      streamer: true,
      channel: true,
      slots: { include: { streamer: true }, orderBy: [{ startTime: "asc" }, { createdAt: "asc" }] },
      orderLines: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!shift) notFound();

  const [settings, streamers, channels, products] = await Promise.all([
    getPaySettings(),
    prisma.streamer.findMany({ where: { OR: [{ isActive: true }, { id: shift.streamerId }] }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.channel.findMany({ where: { OR: [{ isActive: true }, { id: shift.channelId ?? "" }] }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    // สินค้าที่ใช้งานอยู่ + ที่อยู่ในออเดอร์ของกะนี้แล้ว (แม้ปิดใช้งานไปแล้ว ก็ยังแก้จำนวนได้)
    prisma.liveProduct.findMany({
      where: { OR: [{ isActive: true }, { id: { in: shift.orderLines.map((l) => l.productId).filter((x): x is string => !!x) } }] },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, costPerSet: true },
    }),
  ]);

  const range = toRange(shift.startTime, shift.endTime);
  const plannedHours = range ? (range.e - range.s) / 60 : 0;
  const actualHours = shift.slots.reduce((a, s) => a + slotHours(s.startTime, s.endTime), 0);
  const sales = shift.slots.reduce((a, s) => a + s.sales, 0);
  const hasResults = shift.slots.length > 0;
  const pay = applyOverride(computePay(sales, hasResults ? actualHours : plannedHours, settings, shift.date), shift.payOverride);
  const weekParam = isoDate(weekStartOf(shift.date));

  const hoursSub = hasResults ? "ชั่วโมงจากช่วงที่กรอกจริง" : "ชั่วโมงตามที่วางกะไว้ (ยังไม่กรอกยอด)";
  const rows: { label: string; value: string; sub?: string; strong?: boolean; tone?: string }[] = pay.mode === "HOURLY" ? [
    { label: "ยอดขายที่กรอก", value: `${formatBaht(pay.sales)} ฿` },
    { label: `เหมา ${formatBaht(pay.rate)} ฿ × ${formatNum(pay.hours, 2)} ชม.`, value: `${formatBaht(pay.minPay)} ฿`, sub: hoursSub },
    { label: "ระบบคำนวณได้", value: `${formatBaht(pay.computedPay)} ฿` },
    ...(pay.overridden ? [{ label: "แอดมินกำหนดยอดจ่ายเอง", value: `${formatBaht(pay.pay)} ฿`, sub: shift.payNote ?? undefined, strong: true }] : []),
  ] : [
    { label: "ยอดขายที่กรอก", value: `${formatBaht(pay.sales)} ฿` },
    { label: `หักค่าส่ง ${formatNum(settings.shippingPct, 2)}%`, value: `− ${formatBaht(pay.sales - pay.net)} ฿` },
    { label: "ยอดหลังหัก", value: `${formatBaht(pay.net)} ฿` },
    { label: `คอมมิชชั่น ${formatNum(settings.commissionPct, 2)}%`, value: `${formatBaht(pay.commission)} ฿` },
    {
      label: `ขั้นต่ำ ${formatBaht(settings.minHourly)} ฿ × ${formatNum(pay.hours, 2)} ชม.`,
      value: `${formatBaht(pay.minPay)} ฿`,
      sub: hoursSub,
    },
    { label: "ระบบคำนวณได้", value: `${formatBaht(pay.computedPay)} ฿` },
    ...(pay.overridden ? [{ label: "แอดมินกำหนดยอดจ่ายเอง", value: `${formatBaht(pay.pay)} ฿`, sub: shift.payNote ?? undefined, strong: true }] : []),
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap gap-4 text-sm">
        <Link href={`/schedule?week=${weekParam}`} className="text-stone-400 hover:text-muted">
          ← ตารางไลฟ์
        </Link>
        {shift.sessionId && (
          <Link href={`/sessions/${shift.sessionId}`} className="text-stone-400 hover:text-muted">
            รอบไลฟ์ของวันนี้ →
          </Link>
        )}
      </div>
      <div className="mb-5 mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            {shift.streamer.name} <span className="text-base font-medium text-stone-400">· {shift.startTime}–{shift.endTime}</span>
          </h1>
          <p className="text-sm text-muted">
            {formatThaiDate(shift.date)} ({thaiDays[shift.date.getUTCDay()]}) · {shift.channel?.name ?? "ไม่ระบุช่องทาง"} · วางไว้ {formatHours(plannedHours)}
            {hasResults && <> · ไลฟ์จริง {formatHours(actualHours)}</>}
          </p>
          {shift.note && <p className="mt-1 text-sm text-muted">📝 {shift.note}</p>}
        </div>
        <DeleteShiftButton shiftId={shift.id} weekParam={weekParam} />
      </div>

      {/* แก้ไขวัน/เวลา/คนไลฟ์ของกะ — เห็นทันที ไม่ต้องกดเปิด */}
      <div className="mb-6">
        <ShiftEditForm
          shift={{
            id: shift.id,
            date: isoDate(shift.date),
            streamerId: shift.streamerId,
            channelId: shift.channelId,
            startTime: shift.startTime,
            endTime: shift.endTime,
            note: shift.note,
          }}
          streamers={streamers.map((s) => ({ id: s.id, name: s.name }))}
          channels={channels.map((c) => ({ id: c.id, name: c.name }))}
        />
      </div>

      {/* ค่าตอบแทน */}
      <section className={clsx("mb-6 rounded-xl border bg-white p-5", pay.hitMinimum && hasResults ? "border-amber-300" : "border-line")}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[260px] flex-1">
            <h2 className="font-display text-[15px] font-semibold text-ink">
              ค่าตอบแทนกะนี้
              {pay.overridden && <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-800">แอดมินกำหนดเอง</span>}
            </h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              {rows.map((r) => (
                <div key={r.label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">
                    {r.label}
                    {r.sub && <span className="block text-[11px] text-stone-400">{r.sub}</span>}
                  </dt>
                  <dd className={clsx("tabular-nums", r.strong ? "font-semibold text-brand-800" : "text-ink")}>{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="w-full rounded-xl bg-paper p-4 sm:w-64">
            <p className="text-[11px] text-stone-400">ต้องจ่ายคนไลฟ์</p>
            <p className="text-2xl font-bold tabular-nums text-ink">{formatBaht(pay.pay)} ฿</p>
            {pay.overridden ? (
              <p className="mt-1 text-xs text-brand-800">แอดมินกำหนดยอดนี้เอง (ระบบคำนวณได้ {formatBaht(pay.computedPay)} ฿)</p>
            ) : pay.mode === "HOURLY" ? (
              <p className="mt-1 text-xs text-muted">
                จ่ายเหมาชั่วโมงละ {formatBaht(pay.rate)} ฿ ไม่มีคอมมิชชั่นเพิ่ม
                {hasResults ? <> · คิดเป็น <span className="font-semibold text-ink">{pay.costPct === null ? "-" : `${formatNum(pay.costPct, 1)}%`}</span> ของยอดขาย</> : " · ชั่วโมงตามที่วางกะไว้ จนกว่าจะกรอกยอด"}
              </p>
            ) : !hasResults ? (
              <p className="mt-1 text-xs text-stone-400">ประมาณการจากขั้นต่ำ — กรอกยอดขายด้านล่างเพื่อคิดจริง</p>
            ) : pay.hitMinimum ? (
              <div className="mt-2 space-y-1 text-xs">
                <p className="rounded-md bg-amber-100 px-2 py-1 text-amber-800">คอมมิชชั่นไม่ถึงขั้นต่ำ จ่ายตามขั้นต่ำแทน (เพิ่ม {formatBaht(pay.topUp)} ฿)</p>
                <p className="text-muted">
                  คิดเป็นคอมมิชชั่นจริง <span className="font-semibold text-ink">{pay.effectivePct === null ? "-" : `${formatNum(pay.effectivePct, 1)}%`}</span> ของยอดหลังหัก
                </p>
                <p className="text-stone-400">ยอดขายต้องถึง {formatBaht(pay.breakEvenSales)} ฿ คอม {formatNum(settings.commissionPct, 2)}% จึงจะพอดีขั้นต่ำ</p>
              </div>
            ) : (
              <p className="mt-1 text-xs text-emerald-700">จ่ายตามคอมมิชชั่น {formatNum(settings.commissionPct, 2)}% (เกินขั้นต่ำ {formatBaht(pay.commission - pay.minPay)} ฿)</p>
            )}
          </div>
        </div>
        <ShiftPayOverride shiftId={shift.id} computed={pay.computedPay} override={shift.payOverride} note={shift.payNote} />
      </section>

      <h2 className="mb-2 font-display text-[15px] font-semibold text-ink">กรอกยอดหลังไลฟ์เสร็จ</h2>
      <p className="mb-3 text-xs text-stone-400">
        กรอกคนดูเฉลี่ยของแต่ละชั่วโมงในกะ (ระบบเฉลี่ยทั้งกะให้) และยอดขายรวมทั้งกะ — ยอดขายรวมถูกนำไปคิดค่าตอบแทนด้านบน ส่วนตัวเลขรายชั่วโมงไปเข้าหน้าวิเคราะห์
      </p>
      <ShiftResultsForm
        key={`${shift.startTime}-${shift.endTime}`}
        shiftId={shift.id}
        startTime={shift.startTime}
        endTime={shift.endTime}
        settings={{ shippingPct: settings.shippingPct, commissionPct: settings.commissionPct, minHourly: settings.minHourly, payMode: settings.payMode, hourlyRate: settings.hourlyRate, hourlyFrom: settings.hourlyFrom ? isoDate(settings.hourlyFrom) : null }}
        shiftDate={isoDate(shift.date)}
        existing={shift.slots.map((s) => ({ startTime: s.startTime, endTime: s.endTime, viewers: s.viewers, sales: s.sales, peakViewers: s.peakViewers, orders: s.orders }))}
        payOverride={shift.payOverride}
      />

      <h2 className="mb-2 mt-8 font-display text-[15px] font-semibold text-ink">ออเดอร์ของกะ (ค่าส่ง + ต้นทุนวัตถุดิบ)</h2>
      <p className="mb-3 text-xs text-stone-400">
        กรอกว่าลูกค้าสั่งชุดไหนกี่ชุด จำนวนออเดอร์ และค่าส่งรวม — ระบบคูณต้นทุนต่อชุดเป็นต้นทุนวัตถุดิบจริง แล้วนำไปคิดกำไรจริงในหน้าสรุปกำไร
      </p>
      <ShiftOrdersForm
        shiftId={shift.id}
        products={products}
        sales={sales}
        existing={{ orderCount: shift.orderCount, shippingCost: shift.shippingCost, lines: shift.orderLines.map((l) => ({ productId: l.productId, productName: l.productName, quantity: l.quantity, unitCost: l.unitCost })) }}
      />

    </div>
  );
}
