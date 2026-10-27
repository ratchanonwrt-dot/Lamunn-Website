import { computePay, applyOverride, type PaySettings } from "@/lib/pay";
import { slotHours } from "@/lib/format";
import { isoDate, toRange } from "@/lib/schedule";

/**
 * กำไรจากการไลฟ์ (ทุก % คิดจากยอดขายเต็ม)
 *   เงินได้   = ยอดขาย − ค่า Ads − ค่าธรรมเนียม TikTok
 *   กำไรจริง = เงินได้ − ค่าจ้างคนไลฟ์ − ค่าขนส่ง − ต้นทุนวัตถุดิบ
 * ค่าจ้างตามแบบจ่ายของวันนั้น (รวมยอดที่แอดมินกำหนดเอง)
 * คิดเฉพาะกะที่กรอกยอดแล้ว — กะที่ยังไม่กรอกนับแยกไว้ให้รู้ว่ายังขาด
 */
export interface ProfitRates {
  adsPct: number;
  platformFeePct: number;
  shippingCostPct: number;
  cogsPct: number;
}

export interface ProfitShiftInput {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  streamerId: string;
  streamerName: string;
  channelName: string | null;
  payOverride: number | null;
  slots: { startTime: string; endTime: string; sales: number }[];
  // ออเดอร์จริง — กรอกแล้วอย่างใดอย่างหนึ่ง ถือว่าใช้ตัวเลขจริงของกะนั้น (ช่องที่ว่างนับเป็น 0)
  orderCount: number | null;
  shippingCost: number | null;
  orderLines: { quantity: number; unitCost: number }[];
}

export interface ProfitTotals {
  shifts: number;
  hours: number;
  sales: number;
  ads: number;
  fee: number;
  income: number; // เงินได้ = ยอดขาย − Ads − ค่าธรรมเนียม
  pay: number; // ค่าจ้างคนไลฟ์
  shipping: number; // ค่าขนส่ง
  cogs: number; // ต้นทุนวัตถุดิบ
  profit: number; // กำไรจริง
  sets: number; // ชุดที่ขาย (เฉพาะกะที่กรอกออเดอร์)
  orders: number; // จำนวนออเดอร์ (เฉพาะกะที่กรอกออเดอร์)
  actualShifts: number; // กะที่ใช้ค่าส่ง/ต้นทุนจริงจากออเดอร์
  estimatedShifts: number; // กะที่ยังไม่กรอกออเดอร์ ใช้ % ประมาณ
  margin: number | null; // กำไร % ของยอดขาย
  salesPerHour: number | null;
  profitPerHour: number | null;
  roi: number | null; // กำไรต่อค่าจ้าง 1 บาท (%)
}

export interface ProfitReport {
  total: ProfitTotals;
  byStreamer: (ProfitTotals & { key: string; label: string })[];
  byDay: (ProfitTotals & { key: string; label: string })[];
  byHour: (ProfitTotals & { key: string; label: string })[];
  byChannel: (ProfitTotals & { key: string; label: string })[];
  pending: { shifts: number; plannedHours: number; estimatedPay: number }; // กะที่ยังไม่กรอกยอด
  breakEvenSalesPerHour: number | null; // ยอดขาย/ชม. ที่ต้องได้เพื่อไม่ขาดทุน (เฉพาะแบบเหมา)
  incomeRatio: number; // เงินได้ต่อยอดขาย 1 บาท
  keepRatio: number; // เหลือหลังหักทุก % (Ads, ค่าธรรมเนียม, ขนส่ง, ต้นทุน) ต่อยอดขาย 1 บาท — ไว้คิดจุดคุ้มทุน
}

const empty = (): Omit<ProfitTotals, "margin" | "salesPerHour" | "profitPerHour" | "roi"> => ({ shifts: 0, hours: 0, sales: 0, ads: 0, fee: 0, income: 0, pay: 0, shipping: 0, cogs: 0, profit: 0, sets: 0, orders: 0, actualShifts: 0, estimatedShifts: 0 });
const r2 = (n: number) => Math.round(n * 100) / 100;

function finish(t: ReturnType<typeof empty>): ProfitTotals {
  return {
    shifts: t.shifts,
    hours: r2(t.hours),
    sales: r2(t.sales),
    ads: r2(t.ads),
    fee: r2(t.fee),
    income: r2(t.income),
    pay: r2(t.pay),
    shipping: r2(t.shipping),
    cogs: r2(t.cogs),
    profit: r2(t.profit),
    sets: t.sets,
    orders: t.orders,
    actualShifts: t.actualShifts,
    estimatedShifts: t.estimatedShifts,
    margin: t.sales > 0 ? (t.profit / t.sales) * 100 : null,
    salesPerHour: t.hours > 0 ? t.sales / t.hours : null,
    profitPerHour: t.hours > 0 ? t.profit / t.hours : null,
    roi: t.pay > 0 ? (t.profit / t.pay) * 100 : null,
  };
}

type Line = { hours: number; sales: number; ads: number; fee: number; pay: number; shipping: number; cogs: number; sets?: number; orders?: number; actual?: boolean };

function add(t: ReturnType<typeof empty>, x: Line, countShift: boolean) {
  if (countShift) {
    t.shifts += 1;
    if (x.actual) t.actualShifts += 1;
    else t.estimatedShifts += 1;
    t.sets += x.sets ?? 0;
    t.orders += x.orders ?? 0;
  }
  t.hours += x.hours;
  t.sales += x.sales;
  t.ads += x.ads;
  t.fee += x.fee;
  t.income += x.sales - x.ads - x.fee;
  t.pay += x.pay;
  t.shipping += x.shipping;
  t.cogs += x.cogs;
  t.profit += x.sales - x.ads - x.fee - x.pay - x.shipping - x.cogs;
}

export function buildProfitReport(shifts: ProfitShiftInput[], settings: PaySettings & ProfitRates, days: Date[]): ProfitReport {
  const adsR = settings.adsPct / 100;
  const feeR = settings.platformFeePct / 100;
  const shipR = settings.shippingCostPct / 100;
  const cogsR = settings.cogsPct / 100;
  const costsOf = (sales: number) => ({ ads: sales * adsR, fee: sales * feeR, shipping: sales * shipR, cogs: sales * cogsR });
  const total = empty();
  const streamer = new Map<string, { label: string; t: ReturnType<typeof empty> }>();
  const day = new Map<string, ReturnType<typeof empty>>();
  const hour = new Map<number, ReturnType<typeof empty>>();
  const channel = new Map<string, ReturnType<typeof empty>>();
  const pending = { shifts: 0, plannedHours: 0, estimatedPay: 0 };

  for (const sh of shifts) {
    if (sh.slots.length === 0) {
      const r = toRange(sh.startTime, sh.endTime);
      const h = r ? (r.e - r.s) / 60 : 0;
      pending.shifts += 1;
      pending.plannedHours += h;
      pending.estimatedPay += applyOverride(computePay(0, h, settings, sh.date), sh.payOverride).pay;
      continue;
    }
    const hours = sh.slots.reduce((a, s) => a + slotHours(s.startTime, s.endTime), 0);
    const sales = sh.slots.reduce((a, s) => a + s.sales, 0);
    const pay = applyOverride(computePay(sales, hours, settings, sh.date), sh.payOverride).pay;
    // ค่าส่ง/ต้นทุนวัตถุดิบ: ใช้ออเดอร์จริงถ้ากรอกแล้ว ไม่งั้นประมาณจาก % ของยอดขาย
    const actual = sh.orderLines.length > 0 || sh.shippingCost !== null || sh.orderCount !== null;
    const est = costsOf(sales);
    const line: Line = actual
      ? {
          hours,
          sales,
          pay,
          ads: est.ads,
          fee: est.fee,
          shipping: sh.shippingCost ?? 0,
          cogs: sh.orderLines.reduce((a, l) => a + l.quantity * l.unitCost, 0),
          sets: sh.orderLines.reduce((a, l) => a + l.quantity, 0),
          orders: sh.orderCount ?? 0,
          actual: true,
        }
      : { hours, sales, pay, ...est, actual: false };

    add(total, line, true);
    const st = streamer.get(sh.streamerId) ?? { label: sh.streamerName, t: empty() };
    add(st.t, line, true);
    streamer.set(sh.streamerId, st);
    const dk = isoDate(sh.date);
    const dt = day.get(dk) ?? empty();
    add(dt, line, true);
    day.set(dk, dt);
    const ck = sh.channelName ?? "ไม่ระบุช่องทาง";
    const ct = channel.get(ck) ?? empty();
    add(ct, line, true);
    channel.set(ck, ct);

    // รายชั่วโมงของวัน: ยอดขายตามช่วงที่กรอก ค่าจ้างกระจายตามสัดส่วนชั่วโมง (เหมาจ่ายเท่ากันทุกชั่วโมงอยู่แล้ว)
    for (const s of sh.slots) {
      const sh_h = slotHours(s.startTime, s.endTime);
      const startH = Number(s.startTime.slice(0, 2));
      if (!Number.isFinite(startH)) continue;
      const ht = hour.get(startH) ?? empty();
      // ค่าส่ง/ต้นทุนของกะกระจายลงแต่ละชั่วโมงตามสัดส่วนยอดขาย (ยอดเป็นศูนย์ทั้งกะ → ตามชั่วโมง)
      const w = sales > 0 ? s.sales / sales : hours > 0 ? sh_h / hours : 0;
      add(ht, { hours: sh_h, sales: s.sales, pay: hours > 0 ? (pay * sh_h) / hours : 0, ads: s.sales * adsR, fee: s.sales * feeR, shipping: line.shipping * w, cogs: line.cogs * w }, false);
      hour.set(startH, ht);
    }
  }

  const incomeRatio = 1 - adsR - feeR;
  const keepRatio = 1 - adsR - feeR - shipR - cogsR;
  const hourlyRate = settings.payMode === "HOURLY" ? (settings.hourlyRate ?? settings.minHourly) : null;
  // ชั่วโมงไลฟ์เริ่ม 10:00 และข้ามเที่ยงคืนได้ — เรียงตามลำดับเวลาในวันไลฟ์ ไม่ใช่ 0–23
  const hourOrder = (h: number) => (h < 10 ? h + 24 : h);

  return {
    total: finish(total),
    byStreamer: [...streamer.entries()].map(([key, v]) => ({ key, label: v.label, ...finish(v.t) })).sort((a, b) => b.profit - a.profit),
    byDay: days.map((d) => {
      const key = isoDate(d);
      return { key, label: key, ...finish(day.get(key) ?? empty()) };
    }),
    byHour: [...hour.entries()]
      .sort((a, b) => hourOrder(a[0]) - hourOrder(b[0]))
      .map(([h, t]) => ({ key: String(h), label: `${String(h).padStart(2, "0")}:00`, ...finish(t) })),
    byChannel: [...channel.entries()].map(([key, t]) => ({ key, label: key, ...finish(t) })).sort((a, b) => b.profit - a.profit),
    pending: { shifts: pending.shifts, plannedHours: r2(pending.plannedHours), estimatedPay: r2(pending.estimatedPay) },
    breakEvenSalesPerHour: hourlyRate !== null && keepRatio > 0 ? hourlyRate / keepRatio : null,
    incomeRatio,
    keepRatio,
  };
}
