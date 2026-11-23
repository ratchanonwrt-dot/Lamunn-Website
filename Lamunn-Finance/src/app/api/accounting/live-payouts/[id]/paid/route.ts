import { NextRequest, NextResponse } from "next/server";
import { requireLivePayoutTransferApi } from "@/lib/livePayoutAccess";
import { markLivePayoutPaid } from "@/lib/accounting/livePayouts";

/** POST { paid: boolean, paidRef? } — บัญชีบันทึกว่าทำจ่ายแล้ว (หรือถอนสถานะ) ส่งต่อไปเว็บ Live */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireLivePayoutTransferApi();
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const paid = body.paid !== false;
  const paidRef = typeof body.paidRef === "string" && body.paidRef.trim() ? body.paidRef.trim() : null;
  const result = await markLivePayoutPaid(params.id, paid, staff.staffName ?? null, paidRef);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true });
}
