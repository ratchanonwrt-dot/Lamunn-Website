import { NextResponse } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireLivePayoutTransferApi } from "@/lib/livePayoutAccess";

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
