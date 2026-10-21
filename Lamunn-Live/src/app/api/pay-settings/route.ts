import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@lamunn/db-live";
import { requireStaff, EDITOR_ROLES } from "@/lib/requireStaff";
import { getPaySettings } from "@/lib/paySettings";
import { parseDateOnly } from "@/lib/validation";

export async function GET() {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ settings: await getPaySettings() });
}

/**
 * แก้อัตราค่าตอบแทน / % ที่ใช้คิดกำไร (ผู้จัดการขึ้นไป) — ส่งเฉพาะช่องที่จะแก้
 * body: { payMode?, hourlyRate?, hourlyFrom?, shippingPct?, commissionPct?, minHourly?, adsPct?, platformFeePct?, shippingCostPct?, cogsPct? }
 */
export async function PATCH(req: NextRequest) {
  const staff = await requireStaff(EDITOR_ROLES);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const data: Record<string, number | string | Date | null> = {};
  const labels: Record<string, string> = {
    shippingPct: "% ค่าส่ง",
    commissionPct: "% คอมมิชชั่น",
    minHourly: "ขั้นต่ำต่อชั่วโมง",
    hourlyRate: "ค่าจ้างต่อชั่วโมง",
    adsPct: "% ค่า Ads",
    platformFeePct: "% ค่าธรรมเนียม TikTok",
    shippingCostPct: "% ค่าขนส่ง",
    cogsPct: "% ต้นทุนวัตถุดิบ",
  };
  const isMoney = (k: string) => k === "minHourly" || k === "hourlyRate";
  for (const key of ["shippingPct", "commissionPct", "minHourly", "hourlyRate", "adsPct", "platformFeePct", "shippingCostPct", "cogsPct"] as const) {
    if (body[key] === undefined) continue;
    const n = Number(body[key]);
    if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: `${labels[key]} ต้องเป็นตัวเลข 0 ขึ้นไป` }, { status: 400 });
    if (!isMoney(key) && n > 100) return NextResponse.json({ error: `${labels[key]} ต้องไม่เกิน 100` }, { status: 400 });
    data[key] = n;
  }
  if (body.payMode !== undefined) {
    if (body.payMode !== "HOURLY" && body.payMode !== "COMMISSION") return NextResponse.json({ error: "แบบจ่ายไม่ถูกต้อง" }, { status: 400 });
    data.payMode = body.payMode;
  }
  if (body.hourlyFrom !== undefined) {
    // ว่าง = ใช้แบบเหมากับทุกกะ (รวมย้อนหลัง) — ปกติควรระบุวันที่เริ่มใช้
    const d = body.hourlyFrom ? parseDateOnly(body.hourlyFrom) : null;
    if (body.hourlyFrom && !d) return NextResponse.json({ error: "วันที่เริ่มใช้ไม่ถูกต้อง" }, { status: 400 });
    data.hourlyFrom = d;
  }
  const current = await getPaySettings();
  const pick = (k: "adsPct" | "platformFeePct" | "shippingCostPct" | "cogsPct") => (typeof data[k] === "number" ? (data[k] as number) : current[k]);
  if (pick("adsPct") + pick("platformFeePct") + pick("shippingCostPct") + pick("cogsPct") > 100) {
    return NextResponse.json({ error: "ค่า Ads + ค่าธรรมเนียม + ค่าขนส่ง + ต้นทุนวัตถุดิบ รวมกันต้องไม่เกิน 100%" }, { status: 400 });
  }
  const settings = await prisma.paySetting.update({ where: { id: "default" }, data });
  return NextResponse.json({ settings });
}
