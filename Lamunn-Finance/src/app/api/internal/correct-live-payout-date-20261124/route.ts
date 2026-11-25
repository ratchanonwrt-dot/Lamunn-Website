import { NextResponse } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireLivePayoutTransferApi } from "@/lib/livePayoutAccess";

export async function GET() {
  const staff = await requireLivePayoutTransferApi();
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  return new Response(
    "<!doctype html><html lang=\"th\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>แก้วันที่รายการคุณมิ้น</title></head><body style=\"font-family:sans-serif;padding:32px\"><h1>แก้วันที่รายการคุณมิ้น</h1><p>รายการ 2 ชั่วโมง จำนวน 500 บาท จากวันที่ 25/11/2569 เป็น 24/11/2569</p><form method=\"post\"><button type=\"submit\" style=\"padding:12px 20px\">เปลี่ยนวันที่</button></form></body></html>",
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function POST() {
  const staff = await requireLivePayoutTransferApi();
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const matches = await prisma.accLivePayoutWorkItem.findMany({
    where: {
      sourceId: null,
      payeeName: "คุณมิ้น",
      liveDate: new Date("2026-11-25T00:00:00.000Z"),
      hours: 2,
      amount: 500,
    },
    select: { id: true },
  });

  if (matches.length !== 1) {
    return NextResponse.json({ error: "expected exactly one matching row", matches: matches.length }, { status: 409 });
  }

  await prisma.accLivePayoutWorkItem.update({
    where: { id: matches[0].id },
    data: { liveDate: new Date("2026-11-24T00:00:00.000Z") },
  });

  return NextResponse.json({ ok: true, updated: 1, liveDate: "2026-11-24" });
}
