import { NextRequest, NextResponse } from "next/server";
import { requireLivePayoutApi } from "@/lib/livePayoutAccess";
import { createManualLivePayout, parseManualLivePayoutInput } from "@/lib/accounting/livePayoutWorkItems";

/** POST — เพิ่มรายการทำจ่ายที่บัญชีกรอกเอง โดยไม่แก้ข้อมูลต้นทางจากเว็บ Live */
export async function POST(req: NextRequest) {
  const staff = await requireLivePayoutApi();
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (staff.role === "MARKETING" && body.transferQueued === true) {
    return NextResponse.json({ error: "Marketing ไม่มีสิทธิ์ติ๊กขึ้นระบบโอนเงินแล้ว" }, { status: 403 });
  }
  const parsed = parseManualLivePayoutInput(body);
  if (!parsed.data) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const row = await createManualLivePayout(parsed.data, staff.staffName ?? null);
  return NextResponse.json({ row }, { status: 201 });
}
