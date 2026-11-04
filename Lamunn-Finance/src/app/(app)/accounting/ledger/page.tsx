import Link from "next/link";
import { prisma } from "@lamunn/db-finance";
import { requireSectionPage } from "@/lib/permissions";
import { monthRange } from "@/lib/dates";
import { formatThaiDate, thaiMonthLabel } from "@/lib/format";
import { getAllSettings } from "@/lib/settings";
import StatementShell from "@/components/accounting/StatementShell";
import LedgerFilterBar from "@/components/accounting/LedgerFilterBar";
import { fmtSatang, toSatang } from "@/lib/accounting/money";
import { getLedgerAccounts } from "@/lib/accounting/refData";
import { formatPartnerDisplayName } from "@/lib/accounting/partnerDisplay";
import { naturalAmount } from "@/lib/accounting/reports";
import type { AccountType } from "@lamunn/db-finance";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  ASSET: "สินทรัพย์",
  LIABILITY: "หนี้สิน",
  EQUITY: "ส่วนของผู้ถือหุ้น",
  REVENUE: "รายได้",
  EXPENSE: "ค่าใช้จ่าย",
};

const JOURNAL_LABELS: Record<string, string> = {
  GENERAL: "รายวันทั่วไป",
  SALES: "รายวันขาย",
  PURCHASE: "รายวันซื้อ",
  RECEIPT: "รายวันรับเงิน",
  PAYMENT: "รายวันจ่ายเงิน",
  ADJUST: "ปรับปรุง",
  CLOSING: "ปิดบัญชี",
};

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: { accountId?: string; year?: string; month?: string };
}) {
  await requireSectionPage("ACCOUNTING");

  const now = new Date();
  const year = Number(searchParams.year) || now.getUTCFullYear();
  const month = Number(searchParams.month) || now.getUTCMonth() + 1;
  const { start, end } = monthRange(year, month - 1);

  const [settings, accounts] = await Promise.all([
    getAllSettings(),
    getLedgerAccounts(),
  ]);

  const accountId = searchParams.accountId ?? "";
  const account = accounts.find((a) => a.id === accountId) ?? null;

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-gray-900">บัญชีแยกประเภท</h1>
      <p className="mb-4 text-sm text-gray-500">
        ไล่ดูรายการทั้งหมดของบัญชีทีละบัญชี พร้อมยอดยกมาและยอดสะสมทีละบรรทัด — กดเลขที่ใบสำคัญเพื่อดูรายการเต็ม
      </p>

      <LedgerFilterBar accounts={accounts} accountId={accountId} year={year} month={month} />

      {account && (
        <p className="mb-4 text-sm text-gray-600">
          <span className="font-mono text-xs text-gray-400">{account.code}</span>{" "}
          <span className="font-semibold text-gray-800">{account.nameTh}</span>{" "}
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">หมวด {TYPE_LABELS[account.type] ?? account.type}</span>
        </p>
      )}

      {!account ? (
        <AccountIndex accounts={accounts} year={year} month={month} start={start} end={end} />
      ) : (
        <LedgerDetail account={account} start={start} end={end} year={year} month={month} companyName={settings.companyName} />
      )}
    </div>
  );
}

/** ยังไม่ได้เลือกบัญชี — แสดงบัญชีที่มีความเคลื่อนไหวในเดือนนี้ให้กดเข้าไปดูได้เลย */
async function AccountIndex({
  accounts,
  year,
  month,
  start,
  end,
}: {
  accounts: { id: string; code: string; nameTh: string; type: AccountType }[];
  year: number;
  month: number;
  start: Date;
  end: Date;
}) {
  const moved = await prisma.accJournalLine.groupBy({
    by: ["accountId"],
    where: { status: "POSTED", date: { gte: start, lte: end } },
    _sum: { debit: true, credit: true },
    _count: { _all: true },
  });

  if (moved.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500">
        เดือน {thaiMonthLabel(year, month - 1)} ยังไม่มีรายการที่ผ่านรายการแล้ว — เลือกบัญชีด้านบนเพื่อดูยอดยกมาย้อนหลังได้
      </div>
    );
  }

  const byId = new Map(accounts.map((a) => [a.id, a]));
  const rows = moved
    .map((m) => ({ account: byId.get(m.accountId), debit: toSatang(m._sum.debit), credit: toSatang(m._sum.credit), count: m._count._all }))
    .filter((r) => r.account)
    .sort((a, b) => a.account!.code.localeCompare(b.account!.code));

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-400">
            <th className="py-2.5 pl-4 pr-3 text-left font-medium">รหัส</th>
            <th className="py-2.5 px-3 text-left font-medium">ชื่อบัญชี</th>
            <th className="py-2.5 px-3 text-right font-medium">รายการ</th>
            <th className="py-2.5 px-3 text-right font-medium">เดบิต</th>
            <th className="py-2.5 pr-4 text-right font-medium">เครดิต</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((r) => (
            <tr key={r.account!.id} className="border-b border-gray-50 hover:bg-gray-50/60">
              <td className="py-2 pl-4 pr-3 font-mono text-xs text-gray-500">{r.account!.code}</td>
              <td className="py-2 px-3">
                <Link
                  href={`/accounting/ledger?accountId=${r.account!.id}&year=${year}&month=${month}`}
                  className="text-gray-800 hover:text-brand-700 hover:underline"
                >
                  {r.account!.nameTh}
                </Link>
              </td>
              <td className="py-2 px-3 text-right text-xs text-gray-400">{r.count}</td>
              <td className="py-2 px-3 text-right">{fmtSatang(r.debit)}</td>
              <td className="py-2 pr-4 text-right">{fmtSatang(r.credit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** รายละเอียดบัญชีเดียว: ยอดยกมา + รายการในงวด + ยอดสะสมทีละบรรทัด + ยอดยกไป */
async function LedgerDetail({
  account,
  start,
  end,
  year,
  month,
  companyName,
}: {
  account: { id: string; code: string; nameTh: string; type: AccountType };
  start: Date;
  end: Date;
  year: number;
  month: number;
  companyName: string;
}) {
  // สองคิวรีนี้วิ่งบน index [accountId, status, date] ที่ทำไว้ตอนแก้ความเร็ว
  // (วัดแล้วที่ 50,000 บรรทัด: ~90 ms — ดู scripts/loadtest-accounting.ts)
  const [openingAgg, lines] = await Promise.all([
    prisma.accJournalLine.aggregate({
      where: { accountId: account.id, status: "POSTED", date: { lt: start } },
      _sum: { debit: true, credit: true },
    }),
    prisma.accJournalLine.findMany({
      where: { accountId: account.id, status: "POSTED", date: { gte: start, lte: end } },
      orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
      select: {
        id: true,
        date: true,
        debit: true,
        credit: true,
        memo: true,
        entry: { select: { id: true, entryNo: true, description: true, journalType: true } },
        branch: { select: { name: true } },
        partner: { select: { name: true, branchTag: true } },
      },
    }),
  ]);

  // ยอดคงเหลือเก็บแบบ "เดบิตเป็นบวก" แล้วค่อยกลับเครื่องหมายตามหมวดตอนแสดงผล
  const opening = toSatang(openingAgg._sum.debit) - toSatang(openingAgg._sum.credit);
  let running = opening;

  const rows = lines.map((l) => {
    const debit = toSatang(l.debit);
    const credit = toSatang(l.credit);
    running += debit - credit;
    return { line: l, debit, credit, running };
  });

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const closing = opening + totalDebit - totalCredit;
  const natural = (v: number) => naturalAmount(account.type, v);
  const sideLabel = ["LIABILITY", "EQUITY", "REVENUE"].includes(account.type) ? "เครดิต" : "เดบิต";

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card label="ยอดยกมา" value={fmtSatang(natural(opening), { zeroDash: false })} />
        <Card label={`ความเคลื่อนไหวในเดือนนี้ (${rows.length} รายการ)`} value={fmtSatang(totalDebit - totalCredit === 0 ? 0 : natural(totalDebit - totalCredit), { zeroDash: false })} />
        <Card label={`ยอดยกไป (ด้าน${sideLabel})`} value={fmtSatang(natural(closing), { zeroDash: false })} strong />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500">
          บัญชี {account.code} {account.nameTh} ไม่มีรายการในเดือน {thaiMonthLabel(year, month - 1)}
          {opening !== 0 && <> — แต่มียอดยกมา {fmtSatang(natural(opening), { zeroDash: false })} บาท</>}
        </div>
      ) : (
        <StatementShell
          companyName={companyName}
          title={`บัญชีแยกประเภท — ${account.code} ${account.nameTh}`}
          subtitle={`สำหรับเดือน ${thaiMonthLabel(year, month - 1)}`}
        >
          <table className="w-full min-w-[54rem] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400">
                <th className="py-2 pr-3 text-left font-medium">วันที่</th>
                <th className="py-2 px-3 text-left font-medium">เลขที่ใบสำคัญ</th>
                <th className="py-2 px-3 text-left font-medium">รายการ</th>
                <th className="w-32 py-2 px-3 text-right font-medium">เดบิต</th>
                <th className="w-32 py-2 px-3 text-right font-medium">เครดิต</th>
                <th className="w-36 py-2 pl-3 text-right font-medium">คงเหลือ</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr className="border-b border-gray-100 text-gray-500">
                <td className="py-1.5 pr-3" colSpan={5}>
                  ยอดยกมา
                </td>
                <td className="py-1.5 pl-3 text-right font-medium">{fmtSatang(natural(opening), { zeroDash: false })}</td>
              </tr>
              {rows.map((r) => (
                <tr key={r.line.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                  <td className="py-1.5 pr-3 font-mono text-xs text-gray-500">{formatThaiDate(r.line.date)}</td>
                  <td className="py-1.5 px-3">
                    <Link
                      href={`/accounting/journal?year=${year}&month=${month}`}
                      className="font-mono text-xs text-gray-600 hover:text-brand-700 hover:underline"
                    >
                      {r.line.entry.entryNo}
                    </Link>
                    <span className="ml-1.5 text-xs text-gray-400">{JOURNAL_LABELS[r.line.entry.journalType]}</span>
                  </td>
                  <td className="py-1.5 px-3 text-gray-700">
                    {r.line.entry.description}
                    {r.line.memo && <span className="ml-1.5 text-xs text-gray-400">{r.line.memo}</span>}
                    {r.line.partner && <span className="ml-1.5 text-xs text-gray-400">· {formatPartnerDisplayName(r.line.partner.name, r.line.partner.branchTag)}</span>}
                    {r.line.branch && <span className="ml-1.5 text-xs text-gray-400">· {r.line.branch.name}</span>}
                  </td>
                  <td className="py-1.5 px-3 text-right">{fmtSatang(r.debit)}</td>
                  <td className="py-1.5 px-3 text-right">{fmtSatang(r.credit)}</td>
                  <td className="py-1.5 pl-3 text-right font-medium">{fmtSatang(natural(r.running), { zeroDash: false })}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-800 font-bold tabular-nums">
                <td colSpan={3} className="py-2 pr-3">
                  รวมความเคลื่อนไหวในเดือนนี้
                </td>
                <td className="py-2 px-3 text-right">{fmtSatang(totalDebit, { zeroDash: false })}</td>
                <td className="py-2 px-3 text-right">{fmtSatang(totalCredit, { zeroDash: false })}</td>
                <td className="py-2 pl-3 text-right">{fmtSatang(natural(closing), { zeroDash: false })}</td>
              </tr>
            </tfoot>
          </table>
        </StatementShell>
      )}
    </>
  );
}

function Card({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`mt-0.5 tabular-nums ${strong ? "text-lg font-bold text-gray-900" : "text-lg font-semibold text-gray-700"}`}>{value}</p>
    </div>
  );
}
