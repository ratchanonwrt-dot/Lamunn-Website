import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@lamunn/db-live";
import { parseDateOnly, normalizeTime, optionalText } from "@/lib/validation";
import { toRange, rangesOverlap, todayTH } from "@/lib/schedule";
import { gapRuleApplies, findGapViolation } from "@/lib/bookingRules";
import { ME_COOKIE, cleanPhone } from "@/lib/me";

export const dynamic = "force-dynamic";

/** ส่งคำขอจองช่วงไลฟ์ (สาธารณะ) — เข้าคิวรอทีมงานอนุมัติ และจำเบอร์ไว้ในคุกกี้ให้เลย (ไม่ต้องยิง /api/public/me ซ้ำ) */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  // honeypot กันบอทง่าย ๆ: ช่อง "website" ต้องว่าง
  if (typeof body.website === "string" && body.website.trim() !== "") return NextResponse.json({ ok: true, request: null });

  const date = parseDateOnly(body.date);
  if (!date) return NextResponse.json({ error: "กรุณาเลือกวันที่" }, { status: 400 });
  if (date < todayTH()) return NextResponse.json({ error: "เลือกวันที่ย้อนหลังไม่ได้" }, { status: 400 });
  const startTime = normalizeTime(body.startTime);
  const endTime = normalizeTime(body.endTime);
  const range = startTime && endTime ? toRange(startTime, endTime) : null;
  if (!startTime || !endTime || !range) return NextResponse.json({ error: "เวลาไม่ถูกต้อง" }, { status: 400 });
  if (range.e - range.s < 60) return NextResponse.json({ error: "ขอจองอย่างน้อย 1 ชั่วโมง" }, { status: 400 });
  if (range.e - range.s > 12 * 60) return NextResponse.json({ error: "ขอจองได้ไม่เกิน 12 ชั่วโมงต่อครั้ง" }, { status: 400 });

  const requesterName = optionalText(body.requesterName);
  if (!requesterName || requesterName.length < 2) return NextResponse.json({ error: "กรุณากรอกชื่อ" }, { status: 400 });
  const requesterPhone = cleanPhone(body.requesterPhone);
  if (!requesterPhone) return NextResponse.json({ error: "กรุณากรอกเบอร์โทรให้ถูกต้อง (9-15 หลัก)" }, { status: 400 });

  const channelId = typeof body.channelId === "string" && body.channelId ? body.channelId : null;
  if (!channelId) return NextResponse.json({ error: "กรุณาเลือกช่องทาง" }, { status: 400 });
  if (typeof body.isReturning !== "boolean") return NextResponse.json({ error: "กรุณาระบุว่าเคยไลฟ์กับละมุนมาก่อนหรือไม่" }, { status: 400 });

  // อ่านทุกอย่างที่ต้องเช็กในรอบเดียว (ไม่ต้องรอทีละคำสั่ง)
  const [ch, booked, blocked, dup, pendingCount] = await Promise.all([
    prisma.channel.findFirst({ where: { id: channelId, isActive: true } }),
    prisma.liveShift.findMany({ where: { date, channelId }, select: { startTime: true, endTime: true } }),
    prisma.scheduleBlock.findMany({ where: { date, OR: [{ channelId }, { channelId: null }] }, select: { startTime: true, endTime: true } }),
    prisma.slotRequest.findFirst({ where: { date, channelId, requesterPhone, status: "PENDING" }, select: { startTime: true, endTime: true } }),
    prisma.slotRequest.count({ where: { requesterPhone, status: "PENDING" } }),
  ]);
  if (!ch) return NextResponse.json({ error: "ไม่พบช่องทางที่เลือก" }, { status: 400 });
  if (!ch.publicBooking) return NextResponse.json({ error: `${ch.name} ยังไม่เปิดรับจองจากภายนอก` }, { status: 403 });

  // ชนกับกะที่ยืนยันแล้ว -> ไม่รับ
  for (const b of booked) {
    const r = toRange(b.startTime, b.endTime);
    if (r && rangesOverlap(r, range)) return NextResponse.json({ error: `ช่วง ${b.startTime}–${b.endTime} มีคนไลฟ์แล้ว กรุณาเลือกช่วงอื่น` }, { status: 409 });
  }
  // กติกาเว้นระยะ 30 นาที (คนนอก) — เทียบเฉพาะกะที่ยืนยันแล้ว
  // คำขอที่รออนุมัติของคนอื่นไม่ขวาง: ขอซ้อนกันได้ แล้วแอดมินเลือกว่าใครได้ไลฟ์
  if (gapRuleApplies(date.toISOString().slice(0, 10))) {
    const existing = booked.map((x) => toRange(x.startTime, x.endTime)).filter((r): r is NonNullable<typeof r> => !!r);
    const violation = findGapViolation(range, existing);
    if (violation) return NextResponse.json({ error: violation.message, code: "GAP" }, { status: 409 });
  }
  // ชนกับบล็อก unavailable -> ไม่รับ
  for (const b of blocked) {
    const r = toRange(b.startTime, b.endTime);
    if (r && rangesOverlap(r, range)) return NextResponse.json({ error: `ช่วง ${b.startTime}–${b.endTime} ไม่เปิดให้จอง (unavailable)` }, { status: 409 });
  }
  // เบอร์เดิมขอช่วงเดิมซ้ำ -> ไม่รับ
  if (dup) {
    const r = toRange(dup.startTime, dup.endTime);
    if (r && rangesOverlap(r, range)) return NextResponse.json({ error: "คุณส่งคำขอช่วงนี้ไว้แล้ว รอทีมงานอนุมัติ" }, { status: 409 });
  }
  // กันสแปม: เบอร์เดียวส่งได้ไม่เกิน 10 คำขอที่ยังค้าง
  if (pendingCount >= 10) return NextResponse.json({ error: "มีคำขอค้างอยู่มากเกินไป กรุณารอทีมงานตอบก่อน" }, { status: 429 });

  const request = await prisma.slotRequest.create({
    data: {
      date,
      startTime,
      endTime,
      channelId,
      requesterName,
      requesterPhone,
      requesterLine: optionalText(body.requesterLine),
      note: optionalText(body.note),
      isReturning: body.isReturning,
    },
    select: { id: true, date: true, startTime: true, endTime: true, status: true },
  });
  // จำเบอร์ไว้ 30 วัน เพื่อไฮไลต์/จัดการช่วงของตัวเอง (เหมือน POST /api/public/me)
  cookies().set(ME_COOKIE, requesterPhone, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return NextResponse.json({ ok: true, request });
}
