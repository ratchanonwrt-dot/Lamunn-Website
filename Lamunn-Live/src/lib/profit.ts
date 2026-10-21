import { computePay, applyOverride, type PaySettings } from "@/lib/pay";
import { slotHours } from "@/lib/format";
import { isoDate, toRange } from "@/lib/schedule";

/**
 * กำไรจากการไลฟ์
 *   เงินได้จริง = ยอดขาย − ค่า Ads (% ของยอดขาย) − ค่าธรรมเนียม TikTok (% ของยอดขาย)
 *   กำไร       = เงินได้จริง − ค่าจ้างคนไลฟ์ (ตามแบบจ่ายของวันนั้น รวมยอดที่แอดมินกำหนดเอง)
 * คิดเฉพาะกะที่กรอกยอดแล้ว — กะที่ยังไม่กรอกนับแยกไว้ให้รู้ว่ายังขาด
 */
export interface ProfitRates {
  adsPct: number;
  platformFeePct: number;
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
}

export interface ProfitTotals {
  shifts: number;
  hours: number;
  sales: number;
  ads: number;
  fee: number;
  income: number; // เงินได้จริง
  pay: number; // ค่าจ้างคนไลฟ์
  profit: number;
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
  incomeRatio: number; // เงินได้จริงต่อยอดขาย 1 บาท
}

const empty = (): Omit<ProfitTotals, "margin" | "salesPerHour" | "profitPerHour" | "roi"> => ({ shifts: 0, hours: 0, sales: 0, ads: 0, fee: 0, income: 0, pay: 0, profit: 0 });
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
    profit: r2(t.profit),
    margin: t.sales > 0 ? (t.profit / t.sales) * 100 : null,
    salesPerHour: t.hours > 0 ? t.sales / t.hours : null,
    profitPerHour: t.hours > 0 ? t.profit / t.hours : null,
    roi: t.pay > 0 ? (t.profit / t.pay) * 100 : null,
  };
}

function add(t: ReturnType<typeof empty>, x: { hours: number; sales: number; ads: number; fee: number; pay: number }, countShift: boolean) {
  if (countShift) t.shifts += 1;
  t.hours += x.hours;
  t.sales += x.sales;
  t.ads += x.ads;
  t.fee += x.fee;
  t.income += x.sales - x.ads - x.fee;
  t.pay += x.pay;
  t.profit += x.sales - x.ads - x.fee - x.pay;
}

export function buildProfitReport(shifts: ProfitShiftInput[], settings: PaySettings & ProfitRates, days: Date[]): ProfitReport {
  const adsR = settings.adsPct / 100;
  const feeR = settings.platformFeePct / 100;
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
    const line = { hours, sales, ads: sales * adsR, fee: sales * feeR, pay };

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
      add(ht, { hours: sh_h, sales: s.sales, ads: s.sales * adsR, fee: s.sales * feeR, pay: hours > 0 ? (pay * sh_h) / hours : 0 }, false);
      hour.set(startH, ht);
    }
  }

  const incomeRatio = 1 - adsR - feeR;
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
    breakEvenSalesPerHour: hourlyRate !== null && incomeRatio > 0 ? hourlyRate / incomeRatio : null,
    incomeRatio,
  };
}
