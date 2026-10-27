import { prisma } from "@lamunn/db-finance";
import { loadAllSalesData } from "./reportsCalc";

/** ภาพรวมยอดขายทั้งปีของหน้า "ภาพรวม" — ยอดรายเดือนแยกช่องทาง เทียบปีก่อน สะสมทั้งปี และแนวโน้ม
 *
 * ยอดรวมใช้นิยามเดียวกับการ์ด "ยอดขายรวมทั้งหมด" ของหน้าภาพรวม: หน้าร้าน + Grab + Lineman ทุกสาขา
 * + E-Commerce กลาง (TikTok/FB-Line/รับหน้าร้าน/Catering) + Event ชั่วคราว (นับตามวันเริ่มงาน)
 * ใช้ข้อมูลก้อนที่แคชไว้ของหน้ารายงาน (loadAllSalesData) ไม่ยิงคิวรียอดขายเพิ่ม */

export interface YearMonth {
  month: number; // 0-11
  storefront: number;
  delivery: number;
  ecommerce: number;
  event: number;
  total: number;
  lastYear: number; // เดือนเดียวกันของปีก่อน (ทั้งเดือน)
  yoy: number | null;
  cumulative: number;
  lastYearCumulative: number;
  /** เดือนนี้ยังไม่จบ (เดือนปัจจุบัน) หรือยังมาไม่ถึง */
  partial: boolean;
  future: boolean;
}

export interface YearOverview {
  year: number;
  months: YearMonth[];
  ytd: number;
  /** ปีก่อนช่วงเดียวกัน (1 ม.ค. ถึงวันเดียวกันของปีก่อน) — เทียบแบบยุติธรรมกับปีที่ยังไม่จบ */
  lastYearSamePeriod: number;
  lastYearFull: number;
  ytdChange: number | null;
  avgPerMonth: number; // เฉลี่ยของเดือนที่จบแล้ว
  completedMonths: number;
  best: YearMonth | null;
  /** คาดการณ์ทั้งปีจากอัตราเฉลี่ยต่อวันตั้งแต่ต้นปี */
  projection: number | null;
  /** แนวโน้มจากเดือนที่จบแล้ว: โต/หดกี่ % ต่อเดือน (เส้นตรง least squares เทียบค่าเฉลี่ย) */
  monthlyTrendPct: number | null;
  /** ค่าเฉลี่ยเคลื่อนที่ 3 เดือน (เฉพาะเดือนที่มียอด) — null สำหรับเดือนอนาคต */
  ma3: (number | null)[];
  channelTotals: { storefront: number; delivery: number; ecommerce: number; event: number };
  /** ปีก่อนมีข้อมูลในระบบครบทั้งปีไหม — ระบบเริ่มเก็บข้อมูลกลางปี ตัวเลขเทียบปีก่อนอาจไม่ครบ */
  lastYearFirstDataDate: string | null;
}

function pct(a: number, b: number): number | null {
  return b === 0 ? null : (a - b) / b;
}

export async function computeYearOverview(year: number): Promise<YearOverview> {
  const bkk = new Date(Date.now() + 7 * 3600 * 1000);
  const today = new Date(Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), bkk.getUTCDate()));
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));
  const lastStart = new Date(Date.UTC(year - 1, 0, 1));
  const lastEnd = new Date(Date.UTC(year - 1, 11, 31));
  // วันสุดท้ายที่นับของปีนี้ (ปีปัจจุบัน = วันนี้, ปีที่ผ่านไปแล้ว = 31 ธ.ค.)
  const cutoff = today < yearEnd ? today : yearEnd;
  const lastCutoff = new Date(Date.UTC(year - 1, cutoff.getUTCMonth(), Math.min(cutoff.getUTCDate(), new Date(Date.UTC(year - 1, cutoff.getUTCMonth() + 1, 0)).getUTCDate())));

  const [{ branches, salesRows, companyRows }, events] = await Promise.all([
    loadAllSalesData(),
    prisma.eventSale.findMany({
      where: { startDate: { gte: lastStart, lte: yearEnd } },
      select: { startDate: true, storefront: true, grab: true, lineman: true },
    }),
  ]);
  const typeOf = new Map(branches.map((b) => [b.id, b.type]));

  const cur = Array.from({ length: 12 }, () => ({ storefront: 0, delivery: 0, ecommerce: 0, event: 0 }));
  const prevMonth = Array.from({ length: 12 }, () => 0);
  let lastYearSamePeriod = 0;
  let lastYearFirst: Date | null = null;

  const addPrev = (d: Date, amount: number) => {
    prevMonth[d.getUTCMonth()] += amount;
    if (d <= lastCutoff) lastYearSamePeriod += amount;
    if (amount > 0 && (!lastYearFirst || d < lastYearFirst)) lastYearFirst = d;
  };

  for (const r of salesRows) {
    const type = typeOf.get(r.branchId);
    if (!type) continue;
    const storefront = type === "CASH" ? (r.cashPos ?? 0) + (r.transfer ?? 0) : r.cashTransferCombined ?? 0;
    const delivery = r.grab + r.lineman;
    if (r.date >= yearStart && r.date <= cutoff) {
      const m = cur[r.date.getUTCMonth()];
      m.storefront += storefront;
      m.delivery += delivery;
    } else if (r.date >= lastStart && r.date <= lastEnd) {
      addPrev(r.date, storefront + delivery);
    }
  }
  for (const c of companyRows) {
    const ecom = c.tiktok + c.fbLine + c.pickup + c.catering;
    if (c.date >= yearStart && c.date <= cutoff) cur[c.date.getUTCMonth()].ecommerce += ecom;
    else if (c.date >= lastStart && c.date <= lastEnd) addPrev(c.date, ecom);
  }
  for (const e of events) {
    const amount = e.storefront + e.grab + e.lineman;
    if (e.startDate >= yearStart && e.startDate <= cutoff) cur[e.startDate.getUTCMonth()].event += amount;
    else if (e.startDate >= lastStart && e.startDate <= lastEnd) addPrev(e.startDate, amount);
  }

  let cumulative = 0;
  let lastCumulative = 0;
  const months: YearMonth[] = cur.map((m, i) => {
    const total = m.storefront + m.delivery + m.ecommerce + m.event;
    const future = new Date(Date.UTC(year, i, 1)) > cutoff;
    const partial = !future && new Date(Date.UTC(year, i + 1, 0)) > cutoff;
    cumulative += total;
    lastCumulative += prevMonth[i];
    return {
      month: i,
      ...m,
      total,
      lastYear: prevMonth[i],
      // เดือนที่ยังไม่จบเทียบกับทั้งเดือนของปีก่อนไม่ยุติธรรม — ไม่แสดง % ให้เดือนนั้น
      yoy: partial || future ? null : pct(total, prevMonth[i]),
      cumulative,
      lastYearCumulative: lastCumulative,
      partial,
      future,
    };
  });

  const ytd = cumulative;
  const done = months.filter((m) => !m.partial && !m.future && m.total > 0);
  const avgPerMonth = done.length ? done.reduce((a, m) => a + m.total, 0) / done.length : 0;
  const best = done.length ? done.reduce((a, m) => (m.total > a.total ? m : a)) : null;

  const daysElapsed = Math.round((cutoff.getTime() - yearStart.getTime()) / 86400000) + 1;
  const daysInYear = Math.round((yearEnd.getTime() - yearStart.getTime()) / 86400000) + 1;
  const projection = cutoff < yearEnd && ytd > 0 ? (ytd / daysElapsed) * daysInYear : null;

  // แนวโน้มรายเดือน: least squares บนเดือนที่จบแล้วและมียอด
  let monthlyTrendPct: number | null = null;
  if (done.length >= 3) {
    const n = done.length;
    const mx = done.reduce((a, m) => a + m.month, 0) / n;
    const my = avgPerMonth;
    let num = 0;
    let den = 0;
    for (const m of done) {
      num += (m.month - mx) * (m.total - my);
      den += (m.month - mx) ** 2;
    }
    monthlyTrendPct = den && my ? num / den / my : null;
  }

  const ma3 = months.map((m, i) => {
    if (m.future) return null;
    const win = months.slice(Math.max(0, i - 2), i + 1).filter((x) => !x.future && x.total > 0);
    return win.length ? win.reduce((a, x) => a + x.total, 0) / win.length : null;
  });

  const channelTotals = months.reduce(
    (a, m) => ({ storefront: a.storefront + m.storefront, delivery: a.delivery + m.delivery, ecommerce: a.ecommerce + m.ecommerce, event: a.event + m.event }),
    { storefront: 0, delivery: 0, ecommerce: 0, event: 0 }
  );

  const firstPrev = lastYearFirst as Date | null;
  return {
    year,
    months,
    ytd,
    lastYearSamePeriod,
    lastYearFull: prevMonth.reduce((a, v) => a + v, 0),
    ytdChange: pct(ytd, lastYearSamePeriod),
    avgPerMonth,
    completedMonths: done.length,
    best,
    projection,
    monthlyTrendPct,
    ma3,
    channelTotals,
    lastYearFirstDataDate: firstPrev ? firstPrev.toISOString().slice(0, 10) : null,
  };
}
