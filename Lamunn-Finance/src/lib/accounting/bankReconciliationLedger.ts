import { prisma } from "@lamunn/db-finance";
import { toSatang, type Money } from "./money";
import { BANK_RECONCILIATION_ACCOUNT_CODE, type ReconciliationItem } from "./bankReconciliation";

type LedgerSourceLine = {
  date: Date;
  debit: Money;
  credit: Money;
  memo: string | null;
  docNo: string | null;
  entry: { entryNo: string; description: string };
  partner: { name: string } | null;
};

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** แปลงจากบรรทัดสมุดรายวันโดยตรงเพื่อไม่ให้การกระทบยอดต้องพึ่งรูปแบบไฟล์ Excel */
export function mapLedgerLinesForReconciliation(lines: LedgerSourceLine[]): ReconciliationItem[] {
  return lines.map((line, index) => {
    const key = dateKey(line.date);
    return {
      rowNumber: index + 1,
      dateKey: key,
      dateLabel: `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`,
      detail: [line.entry.description, line.memo, line.partner?.name, line.docNo]
        .filter((value): value is string => Boolean(value?.trim()))
        .join(" — "),
      // บัญชีเงินฝากเป็นสินทรัพย์: เดบิตคือเงินเข้า (+) และเครดิตคือเงินออก (-)
      amount: toSatang(line.debit) - toSatang(line.credit),
    };
  });
}

export async function loadLedgerRowsForReconciliation({
  start,
  end,
  accountCode = BANK_RECONCILIATION_ACCOUNT_CODE,
}: {
  start: Date;
  end: Date;
  accountCode?: string;
}) {
  const account = await prisma.accAccount.findUnique({
    where: { code: accountCode },
    select: { id: true, code: true, nameTh: true },
  });
  if (!account) return null;

  const lines = await prisma.accJournalLine.findMany({
    where: {
      accountId: account.id,
      status: "POSTED",
      date: { gte: start, lte: end },
    },
    orderBy: [{ date: "asc" }, { entryId: "asc" }, { sortOrder: "asc" }],
    select: {
      date: true,
      debit: true,
      credit: true,
      memo: true,
      docNo: true,
      entry: { select: { entryNo: true, description: true } },
      partner: { select: { name: true } },
    },
  });

  return { account, rows: mapLedgerLinesForReconciliation(lines) };
}
