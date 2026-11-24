import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/requireStaff";
import {
  normalizeLivePayoutNote,
  setExternalLivePayoutTransferQueued,
  setManualLivePayoutNote,
} from "@/lib/accounting/livePayoutWorkItems";

/** POST — เฉพาะผู้ดูแลระบบสูงสุดเท่านั้นที่เพิ่มหรือแก้หมายเหตุหลังช่องขึ้นระบบโอนเงิน */
export async function POST(req: NextRequest) {
  const staff = await requireStaff(["SUPER_ADMIN"]);
  if (!staff) return NextResponse.json({ error: "เฉพาะ Admin เท่านั้นที่แก้ไขหมายเหตุได้" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const note = normalizeLivePayoutNote(body.note);

  if (body.source === "MANUAL") {
    const id = String(body.workItemId ?? "").trim();
    if (!id) return NextResponse.json({ error: "ไม่พบรายการที่ต้องการแก้ไข" }, { status: 400 });
    const updated = await setManualLivePayoutNote(id, note);
    if (!updated) return NextResponse.json({ error: "ไม่พบรายการที่ต้องการแก้ไข" }, { status: 404 });
    return NextResponse.json({ ok: true, note });
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
        note,
      },
      body.transferQueued === true,
      staff.staffName ?? null,
    );
    return NextResponse.json({ ok: true, note });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
