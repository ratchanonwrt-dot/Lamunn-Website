import { prisma } from "@lamunn/db-live";
import { EDIT_LEAD_HOURS, startsWithin } from "@/lib/bookingRules";
import { myStreamerIds } from "@/lib/phone";

export interface MyRow {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  channel: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  isChange?: boolean; // คำขอเปลี่ยนเวลาของกะที่อนุมัติแล้ว
  hasPendingChange?: boolean; // กะนี้มีคำขอเปลี่ยนเวลารออยู่
  note: string | null;
  editable: boolean;
}

/** ช่วงทั้งหมดของเบอร์ที่จำไว้ (60 วันล่าสุด + อนาคต) พร้อมบอกว่าแก้/ยกเลิกได้ไหม */
export async function loadMyRequests(phone: string, today: Date): Promise<MyRow[]> {
  const since = new Date(Date.now() - 60 * 86400000);
  const [rows, streamerIds] = await Promise.all([
    prisma.slotRequest.findMany({
      where: { requesterPhone: phone, OR: [{ createdAt: { gte: since } }, { date: { gte: today } }] },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: 50,
      include: { channel: { select: { name: true } }, shift: { select: { id: true, date: true, startTime: true, endTime: true, slots: { select: { id: true } } } } },
    }),
    myStreamerIds(phone),
  ]);
  // กะที่แอดมินลงให้เอง (ไม่มีคำขอของเบอร์นี้ผูกอยู่) — ต้องโชว์ด้วย ไม่งั้นคนไลฟ์ไม่รู้ว่าได้กะนั้น
  const linkedShiftIds = new Set(rows.map((r) => r.shiftId).filter(Boolean));
  const direct = streamerIds.size
    ? await prisma.liveShift.findMany({
        where: { streamerId: { in: [...streamerIds] }, date: { gte: today }, id: { notIn: [...linkedShiftIds] as string[] } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        take: 30,
        select: { id: true, date: true, startTime: true, endTime: true, channel: { select: { name: true } } },
      })
    : [];

  // กะที่มีคำขอเปลี่ยนเวลาค้างอยู่ (เพื่อบอกในแถวของกะเดิม)
  const pendingChangeFor = new Set(rows.filter((r) => r.status === "PENDING" && r.replacesShiftId).map((r) => r.replacesShiftId!));
  const fromRequests: MyRow[] = rows.map((r) => {
    const date = r.shift?.date ?? r.date; // แอดมินอาจย้ายกะไปวันอื่น — ยึดวันของกะจริง
    const startTime = r.shift?.startTime ?? r.startTime;
    const endTime = r.shift?.endTime ?? r.endTime;
    // อนุมัติแล้วแต่กะถูกลบออกจากตาราง (เช่น แอดมินลบแล้วลงใหม่) — ไม่ใช่กะที่ยังใช้อยู่ อย่าโชว์ว่า "อนุมัติแล้ว"
    const shiftGone = r.status === "APPROVED" && !r.shift;
    const active = r.status === "PENDING" || (r.status === "APPROVED" && !!r.shift);
    const editable = active && date >= today && !startsWithin(date, startTime, EDIT_LEAD_HOURS) && !(r.shift && r.shift.slots.length > 0);
    return {
      id: r.id,
      date: date.toISOString().slice(0, 10),
      startTime,
      endTime,
      channel: r.channel?.name ?? null,
      status: shiftGone ? "CANCELLED" : r.status,
      isChange: r.status === "PENDING" && !!r.replacesShiftId,
      hasPendingChange: r.status === "APPROVED" && !!r.shiftId && pendingChangeFor.has(r.shiftId),
      note: r.status === "REJECTED" ? r.reviewNote : shiftGone ? "ทีมงานเปลี่ยนกะนี้แล้ว" : null,
      editable,
    };
  });
  const fromSchedule: MyRow[] = direct.map((s) => ({
    id: `shift-${s.id}`,
    date: s.date.toISOString().slice(0, 10),
    startTime: s.startTime,
    endTime: s.endTime,
    channel: s.channel?.name ?? null,
    status: "APPROVED",
    note: "ทีมงานลงกะให้ — ติดต่อทีมงานถ้าต้องการแก้ไข",
    editable: false,
  }));
  return [...fromRequests, ...fromSchedule].sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)));
}
