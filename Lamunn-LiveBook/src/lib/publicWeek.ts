import { prisma } from "@lamunn/db-live";
import { addDays, freeRanges, isoDate, toRange, weekStartOf } from "@/lib/schedule";
import { thaiDaysShort } from "@/lib/format";
import { gapRuleApplies, padRanges, startsWithin, EDIT_LEAD_HOURS } from "@/lib/bookingRules";

const thaiMonthsShort = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export type PublicBlockStatus = "booked" | "requested" | "blocked";

export interface PublicBlock {
  startTime: string;
  endTime: string;
  s: number;
  e: number;
  status: PublicBlockStatus; // booked = มีคนไลฟ์แล้ว (ไม่บอกชื่อ), requested = คำขอของฉันที่รออนุมัติ (ของคนอื่นไม่ส่งมา), blocked = unavailable
  /** เป็นของเบอร์ที่จำไว้ — ใส่ requestId ให้จัดการได้ (คนอื่นไม่เห็น) */
  mine?: { requestId: string; status: "PENDING" | "APPROVED"; editable: boolean };
}

export interface PublicDay {
  date: string;
  dayLabel: string;
  isToday: boolean;
  isPast: boolean;
  gapRule: boolean; // ต้องเว้น 30 นาทีจากช่วงที่มีคนแล้ว (คนนอก)
  blocks: PublicBlock[];
  free: { s: number; e: number }[];
}

export interface PublicWeek {
  weekStart: string;
  weekEnd: string;
  channelId: string | null;
  channels: { id: string; name: string }[];
  days: PublicDay[];
}

/** ตารางสัปดาห์แบบไม่ระบุตัวตน — ถ้ามี phone จะติดป้าย "ของฉัน" ให้เฉพาะช่วงของเบอร์นั้น */
export async function loadPublicWeek(weekParam: string | undefined, channelParam: string | undefined, today: Date, phone: string | null = null): Promise<PublicWeek> {
  const m = weekParam ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekParam) : null;
  const requested = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : today;
  const weekStart = weekStartOf(Number.isNaN(requested.getTime()) ? today : requested);
  const weekEnd = addDays(weekStart, 6);

  const channels = await prisma.channel.findMany({ where: { isActive: true, publicBooking: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } });
  const channelId = channelParam && channels.some((c) => c.id === channelParam) ? channelParam : (channels[0]?.id ?? null);

  const [shifts, requests, blocks_, mine] = await Promise.all([
    prisma.liveShift.findMany({ where: { date: { gte: weekStart, lte: weekEnd }, channelId }, select: { id: true, date: true, startTime: true, endTime: true, slots: { select: { id: true } } } }),
    // คำขอที่รออนุมัติ: ส่งเฉพาะของเบอร์ที่จำไว้ — คนนอกเห็นแค่ "ว่าง" จนกว่าแอดมินจะอนุมัติ (แอดมินเลือกคนที่ดีที่สุดเอง)
    phone
      ? prisma.slotRequest.findMany({ where: { date: { gte: weekStart, lte: weekEnd }, channelId, status: "PENDING", requesterPhone: phone }, select: { id: true, date: true, startTime: true, endTime: true } })
      : Promise.resolve([]),
    prisma.scheduleBlock.findMany({ where: { date: { gte: weekStart, lte: weekEnd }, OR: [{ channelId }, { channelId: null }] }, select: { date: true, startTime: true, endTime: true, label: true } }),
    phone
      ? prisma.slotRequest.findMany({ where: { requesterPhone: phone, date: { gte: weekStart, lte: weekEnd }, status: { in: ["PENDING", "APPROVED"] } }, select: { id: true, status: true, shiftId: true } })
      : Promise.resolve([]),
  ]);
  const myByShift = new Map(mine.filter((r) => r.status === "APPROVED" && r.shiftId).map((r) => [r.shiftId!, r.id]));
  const myPending = new Set(mine.filter((r) => r.status === "PENDING").map((r) => r.id));

  const days: PublicDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const iso = isoDate(date);
    const isPast = date < today;
    const blocks: PublicBlock[] = [];
    for (const s of shifts) {
      if (isoDate(s.date) !== iso) continue;
      const r = toRange(s.startTime, s.endTime);
      if (!r) continue;
      const reqId = myByShift.get(s.id);
      blocks.push({ startTime: s.startTime, endTime: s.endTime, s: r.s, e: r.e, status: "booked", ...(reqId ? { mine: { requestId: reqId, status: "APPROVED", editable: !isPast && !startsWithin(iso, s.startTime, EDIT_LEAD_HOURS) && s.slots.length === 0 } } : {}) });
    }
    for (const q of requests) {
      if (isoDate(q.date) !== iso) continue;
      const r = toRange(q.startTime, q.endTime);
      if (!r) continue;
      blocks.push({ startTime: q.startTime, endTime: q.endTime, s: r.s, e: r.e, status: "requested", ...(myPending.has(q.id) ? { mine: { requestId: q.id, status: "PENDING", editable: !isPast && !startsWithin(iso, q.startTime, EDIT_LEAD_HOURS) } } : {}) });
    }
    for (const b of blocks_) {
      if (isoDate(b.date) !== iso) continue;
      const r = toRange(b.startTime, b.endTime);
      if (r) blocks.push({ startTime: b.startTime, endTime: b.endTime, s: r.s, e: r.e, status: "blocked" });
    }
    blocks.sort((a, b) => a.s - b.s);
    const gapRule = gapRuleApplies(iso);
    // "ว่าง" สำหรับคนนอก = ไม่ทับกะที่ยืนยันแล้ว (+ระยะเว้น 30 นาทีถ้ากติกามีผล) และไม่ทับบล็อก unavailable
    // ช่วงที่มีคนขอแล้วแต่ยังรออนุมัติยังนับว่า "ว่าง" — ขอซ้อนได้ แอดมินเป็นคนเลือก
    const people = blocks.filter((b) => b.status === "booked").map((b) => ({ s: b.s, e: b.e }));
    const taken = [...(gapRule ? padRanges(people) : people), ...blocks.filter((b) => b.status === "blocked").map((b) => ({ s: b.s, e: b.e }))];
    return {
      date: iso,
      gapRule,
      dayLabel: `${thaiDaysShort[date.getUTCDay()]} ${date.getUTCDate()} ${thaiMonthsShort[date.getUTCMonth()]}`,
      isToday: iso === isoDate(today),
      isPast,
      blocks,
      free: freeRanges(taken),
    };
  });

  return { weekStart: isoDate(weekStart), weekEnd: isoDate(weekEnd), channelId, channels, days };
}
