import { fmtSatang } from "@/lib/accounting/money";
import type { ProjectionReport } from "@/lib/accounting/projection";

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

type MonthKey = "estimatedRevenue" | "actualRevenue" | "estimatedExpense" | "actualExpense" | "estimatedBalance" | "actualBalance";

export default function ProjectionTable({ report, selectedMonth }: { report: ProjectionReport; selectedMonth?: number }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 print:overflow-visible print:rounded-none print:border-black">
      <table className="min-w-[1800px] border-collapse bg-white text-[11px] tabular-nums print:min-w-0 print:w-full print:text-[7px]">
        <thead>
          <tr className="bg-gray-100 text-gray-800">
            <th rowSpan={2} className="sticky left-0 z-20 min-w-52 border border-gray-300 bg-gray-100 px-3 py-2 text-left print:static print:min-w-0 print:px-1">
              รายการ
            </th>
            {MONTHS.map((month, index) => (
              <th
                key={month}
                colSpan={2}
                className={`border border-gray-300 px-2 py-2 text-center ${selectedMonth === index + 1 ? "bg-indigo-100 text-indigo-800" : ""}`}
              >
                {month}
              </th>
            ))}
            <th colSpan={2} className="border border-gray-400 bg-slate-200 px-2 py-2 text-center font-bold">รวมทั้งปี</th>
          </tr>
          <tr className="bg-gray-50 text-[10px] text-gray-600 print:text-[6px]">
            {MONTHS.map((month) => (
              <SubHeaders key={month} />
            ))}
            <SubHeaders strong />
          </tr>
        </thead>
        <tbody>
          <MoneyRow
            label="รายได้"
            report={report}
            estimatedKey="estimatedRevenue"
            actualKey="actualRevenue"
            estimatedTotal={report.totals.estimatedRevenue}
            actualTotal={report.totals.actualRevenue}
          />
          <MoneyRow
            label="หัก ค่าใช้จ่าย"
            report={report}
            estimatedKey="estimatedExpense"
            actualKey="actualExpense"
            estimatedTotal={report.totals.estimatedExpense}
            actualTotal={report.totals.actualExpense}
            deducted
          />
          <MoneyRow
            label="คงเหลือ"
            report={report}
            estimatedKey="estimatedBalance"
            actualKey="actualBalance"
            estimatedTotal={report.totals.estimatedBalance}
            actualTotal={report.totals.actualBalance}
            strong
          />
          <AnnualOnlyRow
            label="หัก ขาดทุนสุทธิยกมาไม่เกิน 5 ปี"
            estimated={report.totals.estimatedLossDeducted}
            actual={report.totals.actualLossDeducted}
            deducted
          />
          <AnnualOnlyRow
            label="คงเหลือหลังหักขาดทุนสุทธิยกมา"
            estimated={report.totals.estimatedAfterLoss}
            actual={report.totals.actualAfterLoss}
            final
          />
        </tbody>
      </table>
    </div>
  );
}

function SubHeaders({ strong }: { strong?: boolean }) {
  return (
    <>
      <th className={`min-w-16 border border-gray-300 px-1.5 py-1.5 text-right ${strong ? "bg-slate-100 font-semibold" : ""}`}>ประมาณการ</th>
      <th className={`min-w-16 border border-gray-300 px-1.5 py-1.5 text-right ${strong ? "bg-slate-100 font-semibold" : ""}`}>เกิดขึ้นจริง</th>
    </>
  );
}

function MoneyRow({
  label,
  report,
  estimatedKey,
  actualKey,
  estimatedTotal,
  actualTotal,
  deducted,
  strong,
}: {
  label: string;
  report: ProjectionReport;
  estimatedKey: MonthKey;
  actualKey: MonthKey;
  estimatedTotal: number;
  actualTotal: number;
  deducted?: boolean;
  strong?: boolean;
}) {
  return (
    <tr className={strong ? "border-y-2 border-gray-700 font-semibold" : ""}>
      <RowLabel>{label}</RowLabel>
      {report.months.map((month) => (
        <Pair key={month.month} estimated={month[estimatedKey]} actual={month[actualKey]} deducted={deducted} />
      ))}
      <Pair estimated={estimatedTotal} actual={actualTotal} deducted={deducted} total />
    </tr>
  );
}

function AnnualOnlyRow({ label, estimated, actual, deducted, final }: { label: string; estimated: number; actual: number; deducted?: boolean; final?: boolean }) {
  return (
    <tr className={final ? "border-y-2 border-gray-900 bg-emerald-50 font-bold" : "bg-amber-50"}>
      <RowLabel>{label}</RowLabel>
      {MONTHS.map((month) => (
        <Pair key={month} estimated={0} actual={0} empty />
      ))}
      <Pair estimated={estimated} actual={actual} deducted={deducted} total />
    </tr>
  );
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return <th className="sticky left-0 z-10 border border-gray-300 bg-inherit px-3 py-2 text-left font-semibold print:static print:px-1">{children}</th>;
}

function Pair({ estimated, actual, deducted, total, empty }: { estimated: number; actual: number; deducted?: boolean; total?: boolean; empty?: boolean }) {
  const cell = `border border-gray-300 px-1.5 py-2 text-right ${total ? "bg-slate-50 font-semibold" : ""} print:px-0.5`;
  return (
    <>
      <td className={cell}>{empty ? "-" : displayMoney(estimated, deducted)}</td>
      <td className={cell}>{empty ? "-" : displayMoney(actual, deducted)}</td>
    </>
  );
}

function displayMoney(amount: number, deducted?: boolean) {
  if (amount === 0) return "-";
  if (deducted) return `(${fmtSatang(Math.abs(amount), { zeroDash: false })})`;
  return amount < 0 ? `(${fmtSatang(-amount, { zeroDash: false })})` : fmtSatang(amount, { zeroDash: false });
}
