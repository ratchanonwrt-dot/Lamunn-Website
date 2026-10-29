import { fmtSatang } from "@/lib/accounting/money";
import type { IncomeStatement, StatementSection } from "@/lib/accounting/reports";

export default function IncomeStatementTable({
  current,
  cumulative,
  currentLabel,
}: {
  current: IncomeStatement;
  cumulative: IncomeStatement;
  currentLabel: string;
}) {
  return (
    <table className="w-full min-w-[38rem] border-collapse text-sm">
      <thead>
        <tr className="border-b-2 border-gray-800 text-xs text-gray-500">
          <th className="py-2 pr-3 text-left font-medium">รายการ</th>
          <th className="w-40 px-3 py-2 text-right font-medium">{currentLabel}</th>
          <th className="w-40 py-2 pl-3 text-right font-medium">สะสมตั้งแต่ต้นรอบบัญชี</th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        <GroupHeading label="รายได้" />
        <Section current={current.revenue} cumulative={cumulative.revenue} />
        <Section current={current.otherIncome} cumulative={cumulative.otherIncome} />
        <Total label="รวมรายได้" current={current.totalRevenue} cumulative={cumulative.totalRevenue} strong />

        <GroupHeading label="ค่าใช้จ่าย" />
        <Section current={current.cogs} cumulative={cumulative.cogs} />
        <Section current={current.sellingExpense} cumulative={cumulative.sellingExpense} />
        <Section current={current.adminExpense} cumulative={cumulative.adminExpense} />
        <Total label="รวมค่าใช้จ่าย" current={current.totalExpenses} cumulative={cumulative.totalExpenses} strong />

        <Total
          label="กำไร(ขาดทุน)ก่อนต้นทุนทางการเงินและภาษีเงินได้"
          current={current.operatingProfit}
          cumulative={cumulative.operatingProfit}
        />
        <Section current={current.financeCost} cumulative={cumulative.financeCost} />
        <Total label="กำไร(ขาดทุน)ก่อนภาษีเงินได้" current={current.profitBeforeTax} cumulative={cumulative.profitBeforeTax} />
        <Section current={current.incomeTax} cumulative={cumulative.incomeTax} />
        <Total label="กำไร(ขาดทุน)สุทธิ" current={current.netProfit} cumulative={cumulative.netProfit} final />
      </tbody>
    </table>
  );
}

function GroupHeading({ label }: { label: string }) {
  return (
    <tr>
      <th colSpan={3} className="pb-1 pt-5 text-left text-base font-bold text-gray-900">
        {label}
      </th>
    </tr>
  );
}

/** ยอดหมวดอยู่บรรทัดเดียวกับชื่อหมวด ส่วนบัญชีย่อยเยื้องเข้าไปเพื่ออ่านงบได้เร็วและยังตรวจที่มาได้ */
function Section({ current, cumulative }: { current: StatementSection; cumulative: StatementSection }) {
  const codes = [...new Set([...current.lines.map((line) => line.code), ...cumulative.lines.map((line) => line.code)])].sort();
  const currentMap = new Map(current.lines.map((line) => [line.code, line]));
  const cumulativeMap = new Map(cumulative.lines.map((line) => [line.code, line]));

  return (
    <>
      <tr className="font-medium text-gray-800">
        <td className="py-1.5 pr-3 pl-3">{current.title}</td>
        <Amount value={current.total} className="px-3" />
        <Amount value={cumulative.total} className="pl-3" />
      </tr>
      {codes.map((code) => {
        const line = currentMap.get(code) ?? cumulativeMap.get(code)!;
        return (
          <tr key={code} className="text-xs text-gray-500">
            <td className="py-1 pr-3 pl-8">
              <span className="mr-2 font-mono text-[11px] text-gray-400">{code}</span>
              {line.nameTh}
            </td>
            <Amount value={currentMap.get(code)?.amount ?? 0} className="px-3" />
            <Amount value={cumulativeMap.get(code)?.amount ?? 0} className="pl-3" />
          </tr>
        );
      })}
    </>
  );
}

function Total({
  label,
  current,
  cumulative,
  strong,
  final,
}: {
  label: string;
  current: number;
  cumulative: number;
  strong?: boolean;
  final?: boolean;
}) {
  const border = final ? "border-y-2 border-gray-900" : strong ? "border-y border-gray-400" : "border-t border-gray-300";
  const weight = final ? "text-base font-bold" : "font-semibold";
  return (
    <tr className={`${border} ${weight} text-gray-900`}>
      <td className="py-2 pr-3">{label}</td>
      <Amount value={current} className="px-3" zeroDash={false} />
      <Amount value={cumulative} className="pl-3" zeroDash={false} />
    </tr>
  );
}

function Amount({ value, className, zeroDash = true }: { value: number; className?: string; zeroDash?: boolean }) {
  return (
    <td className={`py-1.5 text-right ${value < 0 ? "text-rose-600" : ""} ${className ?? ""}`}>
      {value < 0 ? `(${fmtSatang(-value, { zeroDash: false })})` : fmtSatang(value, { zeroDash })}
    </td>
  );
}
