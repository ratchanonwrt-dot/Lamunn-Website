import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { revalidateSettings } from "@/lib/settings";
import { CAPACITY_SETTING_KEY } from "@/lib/cateringCalendar";

/** ตั้ง "รับงานได้สูงสุดกี่งานต่อวัน" ของปฏิทิน Catering — แยกจาก /api/settings เพราะทีม Catering
 * แก้ค่านี้ได้เอง โดยไม่ต้องมีสิทธิ์เข้าหน้าตั้งค่าระบบทั้งหมด */
export async function POST(req: NextRequest) {
  const staff = await requireSectionApi("CATERING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { value } = await req.json().catch(() => ({}));
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1 || n > 50) return NextResponse.json({ error: "value must be 1-50" }, { status: 400 });

  await prisma.setting.upsert({
    where: { key: CAPACITY_SETTING_KEY },
    update: { value: String(n) },
    create: { key: CAPACITY_SETTING_KEY, value: String(n) },
  });
  revalidateSettings();
  return NextResponse.json({ value: n });
}
