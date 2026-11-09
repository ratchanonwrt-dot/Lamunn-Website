import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireOwner } from "@/lib/requireStaff";
import { parseDateOnly } from "@/lib/dates";
import { parseDividendSource } from "@/lib/dividendSource";

export async function GET() {
  const staff = await requireOwner();
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const payments = await prisma.dividendPayment.findMany({ orderBy: { date: "desc" } });
  return NextResponse.json({ payments });
}

export async function POST(req: NextRequest) {
  const staff = await requireOwner();
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { date, amount, note } = body;
  if (!date || amount === undefined || amount === "") {
    return NextResponse.json({ error: "date and amount are required" }, { status: 400 });
  }
  const source = parseDividendSource(body.source);
  if (source === "invalid") return NextResponse.json({ error: "source must be CASH or BANK" }, { status: 400 });

  const payment = await prisma.dividendPayment.create({
    data: { date: parseDateOnly(date), amount: Number(amount), note: note || null, source },
  });

  return NextResponse.json({ payment });
}
