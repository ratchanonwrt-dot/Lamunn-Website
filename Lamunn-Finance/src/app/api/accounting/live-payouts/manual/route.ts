import { NextRequest, NextResponse } from "next/server";
import { requireSectionApi } from "@/lib/permissions";
import { createManualLivePayout, parseManualLivePayoutInput } from "@/lib/accounting/livePayoutWorkItems";

/** POST — เพิ่มรายการทำจ่ายที่บัญชีกรอกเอง โดยไม่แก้ข้อมูลต้นทางจากเว็บ Live */
export async function POST(req: NextRequest) {
  const staff = await requireSectionApi("ACCOUNTING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = parseManualLivePayoutInput(body);
  if (!parsed.data) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const row = await createManualLivePayout(parsed.data, staff.staffName ?? null);
  return NextResponse.json({ row }, { status: 201 });
}
