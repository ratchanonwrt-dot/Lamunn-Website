import Link from "next/link";
import { requireSectionPage } from "@/lib/permissions";
import { getAllSettings } from "@/lib/settings";
import { monthRange } from "@/lib/dates";
import { thaiMonthLabel } from "@/lib/format";
import { fmtSatang } from "@/lib/accounting/money";
import { buildInputVatPrintRows, INPUT_VAT_PRINT_HEADERS } from "@/lib/accounting/inputVatPrint";
import { buildInputVatReport } from "@/lib/accounting/taxReports";
import PrintButton from "@/components/accounting/PrintButton";

export const dynamic = "force-dynamic";

function reportPeriod(searchParams: { year?: string; month?: string }) {
  const now = new Date();
  const parsedYear = Number(searchParams.year);
  const parsedMonth = Number(searchParams.month);
  return {
    year: Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2200 ? parsedYear : now.getUTCFullYear(),
    month: Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : now.getUTCMonth() + 1,
  };
}

export default async function InputVatPrintPage({ searchParams }: { searchParams: { year?: string; month?: string } }) {
  await requireSectionPage("ACCOUNTING");
  const { year, month } = reportPeriod(searchParams);
  const { start, end } = monthRange(year, month - 1);
  const [settings, report] = await Promise.all([getAllSettings(), buildInputVatReport(start, end)]);
  const rows = buildInputVatPrintRows(report.rows);

  return (
    <div>
      <style>{`
        @page { size: A4 landscape; margin: 10mm; }
        @media print {
          html, body { background: white !important; }
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }
          tr { break-inside: avoid; }
        }
      `}</style>

      <div className="mx-auto mb-4 flex max-w-[297mm] items-center justify-between gap-3 print:hidden">
        <Link
          href={`/accounting/tax-reports/input-vat?year=${year}&month=${month}`}
          className="text-sm text-gray-500 hover:text-brand-700 hover:underline"
        >
          ← กลับไปรายงานภาษีซื้อ
        </Link>
        <PrintButton label="พิมพ์ / บันทึก PDF" />
      </div>

      <main className="mx-auto min-h-[190mm] w-full max-w-[297mm] bg-white px-8 py-6 text-black shadow-sm print:min-h-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="mb-5 text-center">
          <h1 className="text-xl font-bold">{settings.companyName || "ชื่อบริษัท"}</h1>
          {settings.companyAddress && <p className="mt-1 text-[11px]">{settings.companyAddress}</p>}
          {settings.companyTaxId && <p className="mt-0.5 text-[11px]">เลขประจำตัวผู้เสียภาษี {settings.companyTaxId}</p>}
          <h2 className="mt-3 text-lg font-bold">รายงานภาษีซื้อ</h2>
          <p className="mt-0.5 text-sm">ประจำเดือน {thaiMonthLabel(year, month - 1)}</p>
        </header>

        <table className="w-full table-fixed border-collapse text-[10px] leading-tight tabular-nums">
          <colgroup>
            <col className="w-[5%]" />
            <col className="w-[9%]" />
            <col className="w-[16%]" />
            <col className="w-[25%]" />
            <col className="w-[15%]" />
            <col className="w-[16%]" />
            <col className="w-[14%]" />
          </colgroup>
          <thead>
            <tr>
              {INPUT_VAT_PRINT_HEADERS.map((header, index) => (
                <th
                  key={header}
                  scope="col"
                  className={`border border-black bg-gray-100 px-2 py-2 font-semibold ${index === 0 || index >= 5 ? "text-right" : "text-left"}`}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="border border-black px-3 py-8 text-center text-gray-500">
                  ไม่มีรายการภาษีซื้อในเดือนนี้
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={`${row.order}-${row.invoiceNo}`}>
                  <td className="border border-black px-2 py-1.5 text-right">{row.order}</td>
                  <td className="border border-black px-2 py-1.5 whitespace-nowrap">{row.date}</td>
                  <td className="border border-black px-2 py-1.5 break-words">{row.invoiceNo}</td>
                  <td className="border border-black px-2 py-1.5 break-words">{row.vendorName}</td>
                  <td className="border border-black px-2 py-1.5 break-words">{row.taxId}</td>
                  <td className="border border-black px-2 py-1.5 text-right">{fmtSatang(row.base, { zeroDash: false })}</td>
                  <td className="border border-black px-2 py-1.5 text-right">{fmtSatang(row.vat, { zeroDash: false })}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td colSpan={5} className="border border-black px-2 py-2 text-right">
                รวม {rows.length} รายการ
              </td>
              <td className="border border-black px-2 py-2 text-right">{fmtSatang(report.totalBase, { zeroDash: false })}</td>
              <td className="border border-black px-2 py-2 text-right">{fmtSatang(report.totalVat, { zeroDash: false })}</td>
            </tr>
          </tfoot>
        </table>

        {report.nonClaimableVat !== 0 && (
          <p className="mt-2 text-right text-[10px]">
            ภาษีซื้อที่ขอเครดิตได้ {fmtSatang(report.claimableVat, { zeroDash: false })} บาท · ภาษีซื้อต้องห้าม {fmtSatang(report.nonClaimableVat, { zeroDash: false })} บาท
          </p>
        )}
      </main>
    </div>
  );
}
