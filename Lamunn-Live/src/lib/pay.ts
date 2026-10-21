/** อัตราค่าตอบแทนคนไลฟ์ (ค่าเริ่มต้นตรงกับ PaySetting ในฐานข้อมูล) */
export interface PaySettings {
  shippingPct: number; // หักค่าส่ง/ค่าส่งออกจากยอดขายก่อน (%) — ใช้เฉพาะแบบคอมมิชชั่น
  commissionPct: number; // คอมมิชชั่นจากยอดหลังหัก (%)
  minHourly: number; // ขั้นต่ำต่อชั่วโมง (บาท)
  /** COMMISSION = คอม% เทียบขั้นต่ำ (แบบเดิม) · HOURLY = เหมาต่อชั่วโมง ไม่มีคอมมิชชั่น */
  payMode?: string;
  hourlyRate?: number;
  /** วันที่เริ่มใช้แบบเหมา (YYYY-MM-DD หรือ Date) — กะก่อนวันนั้นยังคิดแบบเดิม */
  hourlyFrom?: string | Date | null;
}

export const DEFAULT_PAY = { shippingPct: 20, commissionPct: 4, minHourly: 250 };

export type PayMode = "HOURLY" | "COMMISSION";

const isoOf = (d: string | Date) => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));

/** กะวันนี้คิดแบบไหน — แบบเหมาใช้เฉพาะกะตั้งแต่ hourlyFrom ไม่งั้นตัวเลขย้อนหลังที่จ่ายไปแล้วจะเปลี่ยน */
export function payModeFor(s: PaySettings, date?: string | Date | null): PayMode {
  if (s.payMode !== "HOURLY") return "COMMISSION";
  if (!s.hourlyFrom || !date) return "HOURLY";
  return isoOf(date) >= isoOf(s.hourlyFrom) ? "HOURLY" : "COMMISSION";
}

/** แอดมินกำหนดยอดจ่ายรวมเอง -> แทนที่ pay ที่คำนวณได้ (ตัวเลขอื่นคงไว้ให้เทียบ) */
export function applyOverride(result: PayResult, override: number | null): PayResult & { overridden: boolean; computedPay: number } {
  if (override === null) return { ...result, overridden: false, computedPay: result.pay };
  return {
    ...result,
    pay: override,
    topUp: result.mode === "COMMISSION" ? override - result.commission : 0,
    hitMinimum: false,
    effectivePct: result.net > 0 ? (override / result.net) * 100 : null,
    costPct: result.sales > 0 ? (override / result.sales) * 100 : null,
    overridden: true,
    computedPay: result.pay,
  };
}

export interface PayResult {
  mode: PayMode | "MIXED";
  sales: number; // ยอดขายที่กรอก
  net: number; // ยอดหลังหักค่าส่ง
  commission: number; // คอมมิชชั่นตาม % ปกติ (แบบเหมา = 0)
  hours: number; // ชั่วโมงที่ใช้คิดเงิน
  rate: number; // บาทต่อชั่วโมงที่ใช้ (เหมา หรือ ขั้นต่ำ)
  minPay: number; // แบบคอม: ขั้นต่ำ = ชั่วโมง x ขั้นต่ำ · แบบเหมา: ค่าเหมา = ชั่วโมง x อัตรา
  pay: number; // จ่ายจริง
  topUp: number; // แบบคอม: ส่วนที่จ่ายเพิ่มให้ถึงขั้นต่ำ · แบบเหมา: 0
  hitMinimum: boolean; // แบบคอม: คอมไม่ถึงขั้นต่ำ
  effectivePct: number | null; // จ่ายจริงคิดเป็นกี่ % ของยอดหลังหักค่าส่ง (นิยามเดิมของ "คอมจริง")
  costPct: number | null; // จ่ายจริงคิดเป็นกี่ % ของยอดขาย — ใช้ดูความคุ้ม (null ถ้ายอดขายเป็นศูนย์)
  breakEvenSales: number; // แบบคอม: ยอดขายที่คอม % ปกติพอดีขั้นต่ำ
}

/**
 * คิดค่าตอบแทน 1 กะ
 *  แบบเหมา (HOURLY):    pay = ชั่วโมง x อัตราเหมา — ไม่มีคอมมิชชั่นเพิ่ม
 *  แบบคอม (COMMISSION): net = sales x (1 - ค่าส่ง%), commission = net x คอม%, pay = max(commission, ชั่วโมง x ขั้นต่ำ)
 * date = วันที่ของกะ ใช้เลือกแบบตาม hourlyFrom (ไม่ส่ง = ใช้แบบปัจจุบัน)
 */
export function computePay(sales: number, hours: number, s: PaySettings, date?: string | Date | null): PayResult {
  const net = Math.max(0, sales) * (1 - s.shippingPct / 100);
  const h = Math.max(0, hours);
  const costPct = (pay: number) => (sales > 0 ? (pay / sales) * 100 : null);
  if (payModeFor(s, date) === "HOURLY") {
    const rate = s.hourlyRate ?? s.minHourly;
    const pay = h * rate;
    return { mode: "HOURLY", sales, net, commission: 0, hours, rate, minPay: pay, pay, topUp: 0, hitMinimum: false, effectivePct: net > 0 ? (pay / net) * 100 : null, costPct: costPct(pay), breakEvenSales: 0 };
  }
  const commission = net * (s.commissionPct / 100);
  const minPay = h * s.minHourly;
  const hitMinimum = commission < minPay;
  const pay = hitMinimum ? minPay : commission;
  const netFactor = (1 - s.shippingPct / 100) * (s.commissionPct / 100);
  return {
    mode: "COMMISSION",
    sales,
    net,
    commission,
    hours,
    rate: s.minHourly,
    minPay,
    pay,
    topUp: hitMinimum ? minPay - commission : 0,
    hitMinimum,
    effectivePct: net > 0 ? (pay / net) * 100 : null,
    costPct: costPct(pay),
    breakEvenSales: netFactor > 0 ? minPay / netFactor : 0,
  };
}

export function sumPay(results: PayResult[]): PayResult {
  const sales = results.reduce((a, r) => a + r.sales, 0);
  const net = results.reduce((a, r) => a + r.net, 0);
  const commission = results.reduce((a, r) => a + r.commission, 0);
  const hours = results.reduce((a, r) => a + r.hours, 0);
  const minPay = results.reduce((a, r) => a + r.minPay, 0);
  const pay = results.reduce((a, r) => a + r.pay, 0);
  const topUp = results.reduce((a, r) => a + r.topUp, 0);
  const modes = new Set(results.map((r) => r.mode));
  return {
    mode: modes.size === 1 ? [...modes][0] : results.length === 0 ? "HOURLY" : "MIXED",
    sales,
    net,
    commission,
    hours,
    rate: hours > 0 ? pay / hours : 0,
    minPay,
    pay,
    topUp,
    hitMinimum: topUp > 0,
    effectivePct: net > 0 ? (pay / net) * 100 : null,
    costPct: sales > 0 ? (pay / sales) * 100 : null,
    breakEvenSales: 0,
  };
}
