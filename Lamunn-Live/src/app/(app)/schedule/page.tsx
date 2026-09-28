import { prisma } from "@lamunn/db-live";
import { requirePageRole } from "@/lib/requirePageRole";
import { parseDateOnly } from "@/lib/validation";
import { addDays, freeRanges, isoDate, pickUnusedColor, todayTH, toRange, weekStartOf } from "@/lib/schedule";
import { formatThaiDateShort, thaiDaysShort, slotHours } from "@/lib/format";
import { getPaySettings } from "@/lib/paySettings";
import { computePay, applyOverride } from "@/lib/pay";
import WeekPicker from "@/components/WeekPicker";
import ScheduleGrid, { type GridDay } from "@/components/ScheduleGrid";

const thaiMonthsShort = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export default async function SchedulePage({ searchParams }: { searchParams: { week?: string } }) {
  await requirePageRole();

  const today = todayTH();
  const requested = parseDateOnly(searchParams.week);
  const weekStart = weekStartOf(requested ?? today);
  const weekEnd = addDays(weekStart, 6);

  const [shifts, streamers, channels, requests, blocks, settings] = await Promise.all([
    prisma.liveShift.findMany({
      where: { date: { gte: weekStart, lte: weekEnd } },
      include: { streamer: true, channel: true, slots: true },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    prisma.streamer.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.channel.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.slotRequest.findMany({ where: { date: { gte: weekStart, lte: weekEnd }, status: "PENDING" }, include: { channel: true } }),
    prisma.scheduleBlock.findMany({ where: { date: { gte: weekStart, lte: weekEnd } }, include: { channel: true } }),
    getPaySettings(),
  ]);

  // สีประจำคนจาก Streamer.color (ตั้งได้ในหน้าคนไลฟ์) — คนที่ยังไม่มีสีจะได้สีที่ยังไม่ซ้ำชั่วคราว
  const allStreamers = [...streamers];
  for (const s of shifts) if (!allStreamers.some((x) => x.id === s.streamerId)) allStreamers.push(s.streamer);
  const colors: Record<string, string> = {};
  const used: string[] = allStreamers.map((s) => s.color).filter((c): c is string => !!c);
  for (const s of allStreamers) {
    if (s.color) colors[s.id] = s.color;
    else {
      const c = pickUnusedColor(used);
      colors[s.id] = c;
      used.push(c);
    }
  }

  // ค่าตอบแทนจริงของกะ — สูตรเดียวกับหน้าค่าคอมมิชชั่น (ชั่วโมงจริงจากที่กรอก + ยอดที่แอดมินกำหนดเอง)
  // เพื่อให้ % คอมจริงบนตารางตรงกับตัวเลขที่จ่ายจริงทุกหน้า
  function shiftPay(s: (typeof shifts)[number]) {
    const sales = s.slots.reduce((a, sl) => a + sl.sales, 0);
    const hasResults = s.slots.length > 0;
    if (!hasResults) return { sales, hasResults, pay: 0, effectivePct: null, hitMinimum: false, payOverridden: false };
    const hours = s.slots.reduce((a, sl) => a + slotHours(sl.startTime, sl.endTime), 0);
    const p = applyOverride(computePay(sales, hours, settings), s.payOverride);
    return { sales, hasResults, pay: p.pay, effectivePct: p.effectivePct, hitMinimum: p.hitMinimum, payOverridden: p.overridden };
  }

  const days: GridDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const iso = isoDate(date);
    const dayShifts = shifts
      .filter((s) => isoDate(s.date) === iso)
      .map((s) => {
        const r = toRange(s.startTime, s.endTime) ?? { s: 0, e: 0 };
        return {
          id: s.id,
          streamerId: s.streamerId,
          streamerName: s.streamer.name,
          channelName: s.channel?.name ?? null,
          startTime: s.startTime,
          endTime: s.endTime,
          s: r.s,
          e: r.e,
          hours: (r.e - r.s) / 60,
          ...shiftPay(s),
        };
      });
    const dayRequests = requests
      .filter((q) => isoDate(q.date) === iso)
      .map((q) => {
        const r = toRange(q.startTime, q.endTime) ?? { s: 0, e: 0 };
        return { id: q.id, requesterName: q.requesterName, channelName: q.channel?.name ?? null, startTime: q.startTime, endTime: q.endTime, s: r.s, e: r.e };
      });
    const dayBlocks = blocks
      .filter((b) => isoDate(b.date) === iso)
      .map((b) => {
        const r = toRange(b.startTime, b.endTime) ?? { s: 0, e: 0 };
        return { id: b.id, label: b.label, note: b.note, channelName: b.channel?.name ?? null, startTime: b.startTime, endTime: b.endTime, s: r.s, e: r.e };
      });
    return {
      date: iso,
      requests: dayRequests,
      blocks: dayBlocks,
      dayLabel: `${thaiDaysShort[date.getUTCDay()]} ${date.getUTCDate()} ${thaiMonthsShort[date.getUTCMonth()]}`,
      isToday: iso === isoDate(today),
      isPast: date < today,
      shifts: dayShifts,
      free: freeRanges([...dayShifts.map((s) => ({ s: s.s, e: s.e })), ...dayBlocks.map((b) => ({ s: b.s, e: b.e }))]),
    };
  });

  const totalHours = days.reduce((a, d) => a + d.shifts.reduce((x, s) => x + s.hours, 0), 0);
  const label = `${formatThaiDateShort(weekStart)} – ${formatThaiDateShort(weekEnd)}`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">ตารางไลฟ์รายสัปดาห์</h1>
          <p className="text-sm text-muted">
            ตารางเปิด 10:00–03:00 (กะที่เลยเที่ยงคืนนับเป็นวันเดิม) · คลิกช่องว่างหรือปุ่มเวลาว่างเพื่อลงกะ แล้วระบบพาไปหน้ากรอกยอดทันที · คลิกกะเดิมเพื่อกรอก/แก้ยอด · สัปดาห์นี้ลงแล้ว{" "}
            {totalHours ? `${totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)} ชม.` : "0 ชม."}
          </p>
        </div>
        <WeekPicker weekStart={isoDate(weekStart)} label={label} isCurrent={isoDate(weekStart) === isoDate(weekStartOf(today))} />
      </div>

      <ScheduleGrid
        days={days}
        streamers={allStreamers.map((s) => ({ id: s.id, name: s.isActive ? s.name : `${s.name} (ปิดใช้งาน)` }))}
        channels={channels.map((c) => ({ id: c.id, name: c.name }))}
        colors={colors}
      />
    </div>
  );
}
