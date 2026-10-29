import Link from "next/link";
import { requireSectionPage } from "@/lib/permissions";
import { monthRange } from "@/lib/dates";
import { thaiMonthLabel } from "@/lib/format";
import { getAllSettings } from "@/lib/settings";
import PrintButton from "@/components/accounting/PrintButton";
import IncomeStatementTable from "@/components/accounting/IncomeStatementTable";
import { loadBalances, buildIncomeStatement } from "@/lib/accounting/reports";
import { fiscalYearStart, shortThaiDate } from "@/lib/accounting/fiscal";

export const dynamic = "force-dynamic";

function reportPeriod(searchParams: { year?: string; month?: string }) {
  const now = new Date();
  const year = Number(searchParams.year);
  const month = Number(searchParams.month);
  return {
    year: Number.isInteger(year) && year >= 2000 && year <= 2200 ? year : now.getUTCFullYear(),
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : now.getUTCMonth() + 1,
  };
}

export default async function IncomeStatementPrintPage({ searchParams }: { searchParams: { year?: string; month?: string } }) {
  await requireSectionPage("ACCOUNTING");

  const { year, month } = reportPeriod(searchParams);
  const { start, end } = monthRange(year, month - 1);
  const settings = await getAllSettings();
  const fyStart = fiscalYearStart(end, Number(settings.fiscalYearStartMonth) || 1);
  const [monthBalances, ytdBalances] = await Promise.all([
    loadBalances({ from: start, to: end }),
    loadBalances({ from: fyStart, to: end }),
  ]);
  const current = buildIncomeStatement(monthBalances);
  const cumulative = buildIncomeStatement(ytdBalances);

  return (
    <div>
      <style>{`
        @page { size: A4 portrait; margin: 12mm; }
        @media print {
          html, body { background: white !important; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
        }
      `}</style>

      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 print:hidden">
        <Link
          href={`/accounting/income-statement?year=${year}&month=${month}`}
          className="text-sm text-gray-500 hover:text-brand-700 hover:underline"
        >
          ← กลับไปงบกำไรขาดทุน
        </Link>
        <PrintButton label="พิมพ์ / บันทึก PDF" />
      </div>

      <main className="mx-auto min-h-[277mm] w-full max-w-[210mm] bg-white px-9 py-8 text-black shadow-sm print:min-h-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="mb-6 text-center">
          <h1 className="text-xl font-bold">{settings.companyName || "ชื่อบริษัท"}</h1>
          <h2 className="mt-1 text-lg font-bold">งบกำไรขาดทุน</h2>
          <p className="mt-1 text-xs">
            สำหรับงวดเดือน {thaiMonthLabel(year, month - 1)} และสะสมตั้งแต่ {shortThaiDate(fyStart)} ถึง {shortThaiDate(end)}
          </p>
          <p className="mt-0.5 text-[10px] text-gray-500">หน่วย: บาท</p>
        </header>

        <div className="overflow-visible">
          <IncomeStatementTable current={current} cumulative={cumulative} currentLabel={thaiMonthLabel(year, month - 1)} />
        </div>
      </main>
    </div>
  );
}
