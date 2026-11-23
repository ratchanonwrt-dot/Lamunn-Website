import { NextRequest, NextResponse } from "next/server";
import { requireLivePayoutApi } from "@/lib/livePayoutAccess";
import { fetchLivePayouts } from "@/lib/accounting/livePayouts";

export const dynamic = "force-dynamic";

/** GET ?from&to&status — proxy ไปเว็บ Live (เฉพาะรายการที่อนุมัติแล้ว) */
export async function GET(req: NextRequest) {
  const staff = await requireLivePayoutApi();
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams;
  const iso = (s: string | null, fallback: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback);
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const from = iso(q.get("from"), new Date(Date.now() - 23 * 86400e3).toISOString().slice(0, 10));
  const to = iso(q.get("to"), today);
  const status = q.get("status") === "APPROVED" || q.get("status") === "PAID" ? (q.get("status") as "APPROVED" | "PAID") : "ALL";
  const { rows, error } = await fetchLivePayouts(from, to, status);
  if (error) return NextResponse.json({ error }, { status: 502 });
  return NextResponse.json({ rows });
}
