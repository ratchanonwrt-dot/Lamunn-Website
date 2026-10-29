import Link from "next/link";
import { requireSectionPage } from "@/lib/permissions";
import { monthRange } from "@/lib/dates";
import { thaiMonthLabel } from "@/lib/format";
import { getAllSettings } from "@/lib/settings";
import MonthFilterBar from "@/components/MonthFilterBar";
import StatementShell from "@/components/accounting/StatementShell";
import IncomeStatementTable from "@/components/accounting/IncomeStatementTable";
import { loadBalances, buildIncomeStatement } from "@/lib/accounting/reports";
import { fiscalYearStart, shortThaiDate } from "@/lib/accounting/fiscal";

export const dynamic = "force-dynamic";

export default async function IncomeStatementPage({ searchParams }: { searchParams: { year?: string; month?: string } }) {
  await requireSectionPage("ACCOUNTING");

  const now = new Date();
  const year = Number(searchParams.year) || now.getUTCFullYear();
  const month = Number(searchParams.month) || now.getUTCMonth() + 1;
  const { start, end } = monthRange(year, month - 1);

  const settings = await getAllSettings();
  const fyStart = fiscalYearStart(end, Number(settings.fiscalYearStartMonth) || 1);

  // สองคอลัมน์ใช้ฐานข้อมูลชุดเดียวกัน แต่แยกช่วงเดือนและยอดสะสมเพื่อให้ตรวจย้อนกลับได้ตรงกัน
  const [monthBalances, ytdBalances] = await Promise.all([
    loadBalances({ from: start, to: end }),
    loadBalances({ from: fyStart, to: end }),
  ]);

  const pl = buildIncomeStatement(monthBalances);
  const ytd = buildIncomeStatement(ytdBalances);
  const hasData = pl.revenue.lines.length > 0 || ytd.revenue.lines.length > 0 || pl.netProfit !== 0 || ytd.netProfit !== 0;

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-gray-900">งบกำไรขาดทุน</h1>
      <p className="mb-4 text-sm text-gray-500">
        รายได้หักต้นทุนและค่าใช้จ่ายของงวด — เทียบเดือนที่เลือกกับยอดสะสมตั้งแต่ต้นรอบบัญชีในตารางเดียว
      </p>

      <MonthFilterBar basePath="/accounting/income-statement" year={year} month={month} />

      {!hasData ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-gray-700">ยังไม่มีรายได้หรือค่าใช้จ่ายที่ผ่านรายการในงวดนี้</p>
          <p className="mt-1 text-sm text-gray-500">
            ลอง <Link href="/accounting/daily-posting" className="text-brand-700 underline">ลงบัญชียอดขายรายวัน</Link> ก่อน
            แล้วกลับมาดูงบใบนี้อีกครั้ง
          </p>
        </div>
      ) : (
        <StatementShell
          companyName={settings.companyName}
          title="งบกำไรขาดทุน"
          subtitle={`สำหรับงวดเดือน ${thaiMonthLabel(year, month - 1)} และสะสมตั้งแต่ ${shortThaiDate(fyStart)} ถึง ${shortThaiDate(end)}`}
          printHref={`/print/income-statement?year=${year}&month=${month}`}
        >
          <IncomeStatementTable current={pl} cumulative={ytd} currentLabel={thaiMonthLabel(year, month - 1)} />
        </StatementShell>
      )}
    </div>
  );
}
