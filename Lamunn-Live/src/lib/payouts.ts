import { prisma } from "@lamunn/db-live";
import { getPaySettings } from "@/lib/paySettings";
import { computePay, applyOverride } from "@/lib/pay";
import { isoDate, toRange } from "@/lib/schedule";
import { slotHours } from "@/lib/format";

export type PayoutRowStatus = "NOT_READY" | "READY" | "APPROVED" | "PAID";

/** แถวทำจ่าย 1 คน 1 วัน — คำนวณสดจากกะที่กรอกยอดแล้ว + สถานะจากตาราง daily_payouts */
export interface PayoutRow {
  id: string | null; // id ของ DailyPayout ถ้าอนุมัติแล้ว
  date: string; // YYYY-MM-DD
  streamerId: string;
  streamerName: string;
  nickname: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  hours: number;
  sales: number;
  amount: number; // ยอดจ่ายที่คำนวณได้ตอนนี้ (เฉพาะกะที่กรอกยอดแล้ว)
  net: number; // ยอดขายหลังหักค่าส่ง — ใช้คิด % คอมจริง
  shiftCount: number; // กะที่กรอกยอดแล้ว
  pendingShifts: number; // กะของวันนั้นที่ยังไม่กรอกยอด
  overridden: boolean; // มีกะที่แอดมินกำหนดยอดเอง
  status: PayoutRowStatus;
  approvedAmount: number | null;
  changed: boolean; // อนุมัติแล้วแต่ยอดปัจจุบันไม่ตรงกับที่อนุมัติ
  approvedBy: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  paidBy: string | null;
  paidRef: string | null;
  note: string | null;
}

const key = (date: string, streamerId: string) => `${date}|${streamerId}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** คำนวณยอดจ่ายรายวันต่อคนในช่วงวันที่ (รวมวันที่อนุมัติไว้แล้วแม้กะจะถูกลบไป) */
export async function computeDailyPayouts(from: Date, to: Date): Promise<PayoutRow[]> {
  const [settings, shifts, approved] = await Promise.all([
    getPaySettings(),
    prisma.liveShift.findMany({
      where: { date: { gte: from, lte: to } },
      include: { streamer: true, slots: { select: { startTime: true, endTime: true, sales: true } } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    prisma.dailyPayout.findMany({ where: { date: { gte: from, lte: to } }, include: { streamer: true, approvedBy: { select: { name: true } } } }),
  ]);

  const rows = new Map<string, PayoutRow>();
  const blank = (date: string, s: (typeof shifts)[number]["streamer"]): PayoutRow => ({
    id: null,
    date,
    streamerId: s.id,
    streamerName: s.name,
    nickname: s.nickname,
    bankName: s.bankName,
    bankAccountNo: s.bankAccountNo,
    bankAccountName: s.bankAccountName,
    hours: 0,
    sales: 0,
    amount: 0,
    net: 0,
    shiftCount: 0,
    pendingShifts: 0,
    overridden: false,
    status: "NOT_READY",
    approvedAmount: null,
    changed: false,
    approvedBy: null,
    approvedAt: null,
    paidAt: null,
    paidBy: null,
    paidRef: null,
    note: null,
  });

  for (const sh of shifts) {
    const date = isoDate(sh.date);
    const k = key(date, sh.streamerId);
    const row = rows.get(k) ?? blank(date, sh.streamer);
    if (sh.slots.length === 0) {
      row.pendingShifts += 1;
    } else {
      const hours = sh.slots.reduce((a, sl) => a + slotHours(sl.startTime, sl.endTime), 0);
      const sales = sh.slots.reduce((a, sl) => a + sl.sales, 0);
      const pay = applyOverride(computePay(sales, hours, settings), sh.payOverride);
      row.hours += hours;
      row.sales += sales;
      row.amount += pay.pay;
      row.net += pay.net;
      row.shiftCount += 1;
      if (pay.overridden) row.overridden = true;
    }
    rows.set(k, row);
  }

  for (const p of approved) {
    const date = isoDate(p.date);
    const k = key(date, p.streamerId);
    const row = rows.get(k) ?? blank(date, p.streamer);
    row.id = p.id;
    row.status = p.status;
    row.approvedAmount = p.amount;
    row.changed = Math.abs(round2(row.amount) - round2(p.amount)) >= 0.01;
    row.approvedBy = p.approvedBy?.name ?? null;
    row.approvedAt = p.approvedAt.toISOString();
    row.paidAt = p.paidAt?.toISOString() ?? null;
    row.paidBy = p.paidBy;
    row.paidRef = p.paidRef;
    row.note = p.note;
    rows.set(k, row);
  }

  const out = Array.from(rows.values()).map((r) => {
    if (r.status !== "APPROVED" && r.status !== "PAID") r.status = r.shiftCount > 0 ? "READY" : "NOT_READY";
    r.hours = round2(r.hours);
    r.sales = round2(r.sales);
    r.amount = round2(r.amount);
    r.net = round2(r.net);
    // กะที่ยังไม่มีชั่วโมงจริง (ยังไม่กรอก) — ใช้ชั่วโมงตามแผนเพื่อให้เห็นภาพ ไม่รวมในยอด
    return r;
  });
  out.sort((a, b) => (a.date === b.date ? a.streamerName.localeCompare(b.streamerName, "th") : b.date.localeCompare(a.date)));
  return out;
}

/** ชั่วโมงตามแผนของกะ (ใช้แสดงประกอบเมื่อยังไม่กรอกยอด) */
export function plannedHours(startTime: string, endTime: string): number {
  const r = toRange(startTime, endTime);
  return r ? (r.e - r.s) / 60 : 0;
}

/** อนุมัติยอดของวัน/คน (snapshot ยอด ณ ตอนนี้) — ถ้าจ่ายแล้วห้ามแก้ */
export async function approvePayout(row: PayoutRow, staffId: string, note?: string | null) {
  if (row.status === "PAID") throw new Error("รายการนี้บัญชีทำจ่ายแล้ว แก้ไขไม่ได้");
  if (row.shiftCount === 0) throw new Error("ยังไม่มีกะที่กรอกยอดในวันนี้");
  const date = new Date(row.date + "T00:00:00Z");
  const data = {
    amount: row.amount,
    hours: row.hours,
    sales: row.sales,
    shiftCount: row.shiftCount,
    payeeName: row.bankAccountName?.trim() || row.streamerName,
    bankName: row.bankName,
    bankAccountNo: row.bankAccountNo,
    note: note ?? row.note ?? null,
    status: "APPROVED" as const,
    approvedByStaffId: staffId,
    approvedAt: new Date(),
  };
  return prisma.dailyPayout.upsert({
    where: { date_streamerId: { date, streamerId: row.streamerId } },
    create: { date, streamerId: row.streamerId, ...data },
    update: data,
  });
}

export function parseIsoDate(s: string | undefined | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  return Number.isNaN(d.getTime()) ? null : d;
}
