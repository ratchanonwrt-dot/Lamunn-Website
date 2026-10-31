import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { parseDateOnly } from "@/lib/dates";
import { CASH_ON_HAND_CACHE_TAG } from "@/lib/finance";
import { CREDIT_TERM_CACHE_TAG } from "@/lib/creditTermCalc";
import { SALES_DATA_CACHE_TAG } from "@/lib/reportsCalc";

export async function GET(req: NextRequest) {
  const staff = await requireSectionApi("MONTHLY", "view");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const branchId = searchParams.get("branchId");
  const date = searchParams.get("date");
  if (!branchId || !date) return NextResponse.json({ error: "branchId and date are required" }, { status: 400 });

  const row = await prisma.dailySales.findUnique({
    where: { branchId_date: { branchId, date: parseDateOnly(date) } },
  });
  return NextResponse.json({ row });
}

export async function POST(req: NextRequest) {
  const staff = await requireSectionApi("MONTHLY", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    branchId,
    date,
    cashPos,
    cashCounted,
    transfer,
    cashTransferCombined,
    grab,
    lineman,
    shopee,
    posCheckTotal,
    note,
    overrideStorefront,
    overrideGrab,
    overrideLineman,
    overrideShopee,
    overrideCashCounted,
  } = body;
  if (!branchId || !date) return NextResponse.json({ error: "branchId and date are required" }, { status: 400 });

  const data: Record<string, unknown> = {};
  // Only touch posCheckTotal/note when the caller actually sent that key — a lean single-cell
  // edit (e.g. from the branch x day matrix) omits these entirely, and must leave whatever's
  // already saved untouched rather than nulling it out.
  if ("posCheckTotal" in body) data.posCheckTotal = posCheckTotal === "" || posCheckTotal === undefined ? null : Number(posCheckTotal);
  if ("note" in body) data.note = note || null;
  // Storefront/Grab/Lineman/CashCounted are only written (and flagged as a manual override)
  // when the client detected the submitted value actually differs from what was loaded —
  // this is how a POS/IMS-linked branch's auto-synced fields stay untouched unless staff
  // genuinely typed something new, so the next sync doesn't clobber a deliberate manual entry.
  if (overrideStorefront) {
    data.cashPos = cashPos === "" || cashPos === undefined ? null : Number(cashPos);
    data.transfer = transfer === "" || transfer === undefined ? null : Number(transfer);
    data.cashTransferCombined = cashTransferCombined === "" || cashTransferCombined === undefined ? null : Number(cashTransferCombined);
    data.storefrontOverride = true;
  }
  if (overrideGrab) {
    data.grab = grab === "" || grab === undefined ? 0 : Number(grab);
    data.grabOverride = true;
  }
  if (overrideLineman) {
    data.lineman = lineman === "" || lineman === undefined ? 0 : Number(lineman);
    data.linemanOverride = true;
  }
  if (overrideShopee) {
    data.shopee = shopee === "" || shopee === undefined ? 0 : Number(shopee);
    data.shopeeOverride = true;
  }
  if (overrideCashCounted) {
    data.cashCounted = cashCounted === "" || cashCounted === undefined ? null : Number(cashCounted);
    data.cashCountedOverride = true;
  }

  const row = await prisma.dailySales.upsert({
    where: { branchId_date: { branchId, date: parseDateOnly(date) } },
    update: data,
    create: { branchId, date: parseDateOnly(date), ...data },
  });

  // ยอดขายรายวันเป็นข้อมูลต้นทางของทั้งเงินสดสะสมและยอดค้าง Credit Term ที่ cache ไว้
  revalidateTag(CASH_ON_HAND_CACHE_TAG);
  revalidateTag(CREDIT_TERM_CACHE_TAG);
  revalidateTag(SALES_DATA_CACHE_TAG);
  return NextResponse.json({ row });
}
