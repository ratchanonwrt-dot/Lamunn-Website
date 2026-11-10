import Link from "next/link";
import type { AccWhtFormType } from "@lamunn/db-finance";
import { requireSectionPage } from "@/lib/permissions";
import { getAllSettings } from "@/lib/settings";
import { monthRange } from "@/lib/dates";
import { thaiMonthLabel } from "@/lib/format";
import { fmtSatang } from "@/lib/accounting/money";
import { buildWhtReport } from "@/lib/accounting/taxReports";
import { WHT_FORM_SHORT } from "@/lib/accounting/whtTypes";
import { formatAccountingDate } from "@/lib/accounting/dateFormat";
import { formatPartnerDisplayName } from "@/lib/accounting/partnerDisplay";
import PrintButton from "@/components/accounting/PrintButton";

export const dynamic = "force-dynamic";

export default async function WhtReportPrintPage({ searchParams }: { searchParams: { year?: string; month?: string; formType?: string } }) {
  await requireSectionPage("ACCOUNTING");
  const now = new Date();
  const year = Number(searchParams.year) || now.getUTCFullYear();
  const month = Number(searchParams.month) || now.getUTCMonth() + 1;
  const formType: AccWhtFormType = searchParams.formType === "PND3" ? "PND3" : "PND53";
  const { start, end } = monthRange(year, month - 1);
  const [settings, report] = await Promise.all([getAllSettings(), buildWhtReport(start, end, formType)]);
  const reportPath = formType === "PND3" ? "pnd3" : "pnd53";

  return (
    <div>
      <style>{`
        @page { size: A4 landscape; margin: 10mm; }
        @media print { html, body { background: white !important; } thead { display: table-header-group; } tfoot { display: table-footer-group; } tr { break-inside: avoid; } }
      `}</style>
      <div className="mx-auto mb-4 flex max-w-[297mm] items-center justify-between print:hidden">
        <Link href={`/accounting/tax-reports/${reportPath}?year=${year}&month=${month}`} className="text-sm text-gray-500 hover:text-brand-700 hover:underline">
          ← กลับรายงาน {WHT_FORM_SHORT[formType]}
        </Link>
        <PrintButton label="พิมพ์ / บันทึก PDF" />
      </div>

      <main className="mx-auto min-h-[190mm] w-full max-w-[297mm] bg-white px-7 py-6 text-black shadow-sm print:min-h-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="mb-5 text-center">
          <h1 className="text-xl font-bold">{settings.companyName || "ชื่อบริษัท"}</h1>
          {settings.companyAddress && <p className="mt-1 text-[10px]">{settings.companyAddress}</p>}
          {settings.companyTaxId && <p className="mt-0.5 text-[10px]">เลขประจำตัวผู้เสียภาษี {settings.companyTaxId}</p>}
          <h2 className="mt-3 text-lg font-bold">{WHT_FORM_SHORT[formType]} — ภาษีเงินได้หัก ณ ที่จ่าย</h2>
          <p className="mt-0.5 text-sm">สำหรับเดือน {thaiMonthLabel(year, month - 1)} · ผู้รับเงิน {report.payeeCount} ราย</p>
        </header>

        <table className="w-full table-fixed border-collapse text-[9px] leading-tight tabular-nums">
          <colgroup>
            <col className="w-[5%]" /><col className="w-[9%]" /><col className="w-[13%]" /><col className="w-[21%]" /><col className="w-[13%]" />
            <col className="w-[17%]" /><col className="w-[9%]" /><col className="w-[6%]" /><col className="w-[7%]" />
          </colgroup>
          <thead>
            <tr className="bg-gray-100">
              {["ลำดับ", "วันที่จ่าย", "เลขที่หนังสือรับรอง", "ผู้รับเงิน", "เลขผู้เสียภาษี", "ประเภทเงินได้", "จำนวนเงินที่จ่าย", "อัตรา", "ภาษีที่หัก"].map((header) => (
                <th key={header} className="border border-black px-1.5 py-2 font-semibold">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 ? (
              <tr><td colSpan={9} className="border border-black px-3 py-8 text-center text-gray-500">ไม่มีรายการในเดือนนี้</td></tr>
            ) : report.rows.map((row, index) => (
              <tr key={row.id}>
                <td className="border border-black px-1.5 py-1.5 text-center">{index + 1}</td>
                <td className="whitespace-nowrap border border-black px-1.5 py-1.5">{formatAccountingDate(row.payDate)}</td>
                <td className="break-words border border-black px-1.5 py-1.5 font-mono">{row.docNo}</td>
                <td className="break-words border border-black px-1.5 py-1.5">{formatPartnerDisplayName(row.payeeName, row.payeeBranchTag)}</td>
                <td className="break-words border border-black px-1.5 py-1.5 font-mono">{row.payeeTaxId ?? "-"}</td>
                <td className="break-words border border-black px-1.5 py-1.5">{row.incomeType}</td>
                <td className="border border-black px-1.5 py-1.5 text-right">{fmtSatang(row.base, { zeroDash: false })}</td>
                <td className="border border-black px-1.5 py-1.5 text-right">{(row.rate * 100).toFixed(2)}%</td>
                <td className="border border-black px-1.5 py-1.5 text-right">{fmtSatang(row.wht, { zeroDash: false })}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td colSpan={6} className="border border-black px-2 py-2 text-right">รวม {report.rows.length} รายการ · ผู้รับเงิน {report.payeeCount} ราย</td>
              <td className="border border-black px-1.5 py-2 text-right">{fmtSatang(report.totalBase, { zeroDash: false })}</td>
              <td className="border border-black" />
              <td className="border border-black px-1.5 py-2 text-right">{fmtSatang(report.totalWht, { zeroDash: false })}</td>
            </tr>
          </tfoot>
        </table>
      </main>
    </div>
  );
}
