import { NextRequest, NextResponse } from "next/server";
import { requireSectionApi } from "@/lib/permissions";
import { monthRange } from "@/lib/dates";
import { BANK_RECONCILIATION_ACCOUNT_CODE } from "@/lib/accounting/bankReconciliation";
import { loadLedgerRowsForReconciliation } from "@/lib/accounting/bankReconciliationLedger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const staff = await requireSectionApi("ACCOUNTING", "view");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const year = Number(req.nextUrl.searchParams.get("year"));
  const month = Number(req.nextUrl.searchParams.get("month"));
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "งวดบัญชีไม่ถูกต้อง" }, { status: 400 });
  }

  const data = await loadLedgerRowsForReconciliation({
    ...monthRange(year, month - 1),
    accountCode: BANK_RECONCILIATION_ACCOUNT_CODE,
  });
  if (!data) {
    return NextResponse.json(
      { error: `ไม่พบบัญชีรหัส ${BANK_RECONCILIATION_ACCOUNT_CODE} ในผังบัญชี` },
      { status: 404 },
    );
  }

  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
