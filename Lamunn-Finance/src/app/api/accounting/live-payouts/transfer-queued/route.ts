import { NextRequest, NextResponse } from "next/server";
import { requireSectionApi } from "@/lib/permissions";
import {
  setExternalLivePayoutTransferQueued,
  setManualLivePayoutTransferQueued,
} from "@/lib/accounting/livePayoutWorkItems";

/** POST — ติ๊กว่ารายการถูกนำขึ้นระบบโอนแล้ว แยกจากสถานะจ่ายจริงของเว็บ Live */
export async function POST(req: NextRequest) {
  const staff = await requireSectionApi("ACCOUNTING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const transferQueued = body.transferQueued === true;
  if (body.source === "MANUAL") {
    const id = String(body.workItemId ?? "").trim();
    if (!id) return NextResponse.json({ error: "ไม่พบรายการที่ต้องการแก้ไข" }, { status: 400 });
    const updated = await setManualLivePayoutTransferQueued(id, transferQueued);
    if (!updated) return NextResponse.json({ error: "ไม่พบรายการที่ต้องการแก้ไข" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  const sourceId = String(body.sourceId ?? "").trim();
  if (!sourceId) return NextResponse.json({ error: "ไม่พบรายการจากเว็บ Live" }, { status: 400 });
  try {
    await setExternalLivePayoutTransferQueued(
      {
        id: sourceId,
        date: String(body.date ?? ""),
        payeeName: String(body.payeeName ?? ""),
        hours: Number(body.hours),
        amount: Number(body.amount),
        note: typeof body.note === "string" ? body.note : null,
      },
      transferQueued,
      staff.staffName ?? null,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
