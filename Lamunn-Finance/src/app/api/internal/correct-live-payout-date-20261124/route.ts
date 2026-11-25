import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@lamunn/db-finance";

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.PAYOUT_SHARED_SECRET;
  if (!expectedSecret || req.headers.get("x-payout-secret") !== expectedSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const matches = await prisma.accLivePayoutWorkItem.findMany({
    where: {
      sourceId: null,
      payeeName: "คุณยิ้ม",
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
