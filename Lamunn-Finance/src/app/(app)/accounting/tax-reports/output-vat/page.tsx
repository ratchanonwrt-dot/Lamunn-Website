import { requireSectionPage } from "@/lib/permissions";
import { monthRange } from "@/lib/dates";
import { thaiMonthLabel } from "@/lib/format";
import { getAllSettings } from "@/lib/settings";
import MonthFilterBar from "@/components/MonthFilterBar";
import TaxReportTabs from "@/components/accounting/TaxReportTabs";
import StatementShell from "@/components/accounting/StatementShell";
import { buildOutputVatReport } from "@/lib/accounting/taxReports";
import { fmtSatang } from "@/lib/accounting/money";
import { formatPartnerDisplayName } from "@/lib/accounting/partnerDisplay";
import { formatAccountingDate } from "@/lib/accounting/dateFormat";

export const dynamic = "force-dynamic";

export default async function OutputVatPage({ searchParams }: { searchParams: { year?: string; month?: string } }) {
  await requireSectionPage("ACCOUNTING");

  const now = new Date();
  const year = Number(searchParams.year) || now.getUTCFullYear();
  const month = Number(searchParams.month) || now.getUTCMonth() + 1;
  const { start, end } = monthRange(year, month - 1);

  const [settings, report] = await Promise.all([getAllSettings(), buildOutputVatReport(start, end)]);

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-gray-900">รายงานภาษีขาย</h1>
      <p className="mb-4 text-sm text-gray-500">
        รายละเอียดใบกำกับภาษีที่ออกในเดือนนี้ — ใช้แนบไปกับ ภ.พ.30
      </p>

      <TaxReportTabs />
      <MonthFilterBar basePath="/accounting/tax-reports/output-vat" year={year} month={month} />

      <div className="mb-4 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
        ยอดขายหน้าร้านที่ไม่ได้ออกใบกำกับเต็มรูป จะรวมเป็น <b>ใบกำกับอย่างย่อ 1 บรรทัดต่อวัน</b> —
        และหักยอดใบกำกับเต็มรูปของวันนั้นออกให้แล้ว จึงไม่มีทางนับซ้ำ
        <br />
        รายการที่บัญชีคีย์เองในสมุดรายวันแล้วแตะบัญชีภาษีขาย จะถูกดึงเข้ามาแสดงด้วย (ป้าย <b>สมุดรายวัน</b>)
      </div>

      {report.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500">
          ยังไม่มียอดขายที่ผ่านรายการในเดือน {thaiMonthLabel(year, month - 1)}
        </div>
      ) : (
        <StatementShell
          companyName={settings.companyName}
          title="รายงานภาษีขาย"
          subtitle={`สำหรับเดือนภาษี ${thaiMonthLabel(year, month - 1)}`}
        >
          <table className="w-full min-w-[56rem] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400">
                <th className="w-12 py-2 pr-2 text-right font-medium">ลำดับ</th>
                <th className="py-2 px-2 text-left font-medium">วันที่</th>
                <th className="py-2 px-2 text-left font-medium">เลขที่ใบกำกับ</th>
                <th className="py-2 px-2 text-left font-medium">ชื่อผู้ซื้อ</th>
                <th className="py-2 px-2 text-left font-medium">เลขผู้เสียภาษี</th>
                <th className="py-2 px-2 text-right font-medium">มูลค่าสินค้า/บริการ</th>
                <th className="py-2 pl-2 text-right font-medium">ภาษีขาย</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {report.rows.map((r, i) => (
                <tr key={`${r.kind}-${r.docNo}-${i}`} className="border-b border-gray-50">
                  <td className="py-1.5 pr-2 text-right text-xs text-gray-400">{i + 1}</td>
                  <td className="py-1.5 px-2 font-mono text-xs text-gray-500">{formatAccountingDate(r.date)}</td>
                  <td className="py-1.5 px-2 text-gray-700">
                    {r.kind === "DAILY" ? (
                      <span className="text-xs text-gray-500">{r.docNo}</span>
                    ) : (
                      <span className="font-mono text-xs">{r.docNo}</span>
                    )}
                    {r.kind === "JOURNAL" && (
                      <span className="ml-1.5 rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700">สมุดรายวัน</span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-gray-800">
                    {formatPartnerDisplayName(r.customerName, r.branchTag)}
                  </td>
                  <td className="py-1.5 px-2 font-mono text-xs text-gray-500">{r.taxId ?? "-"}</td>
                  <td className="py-1.5 px-2 text-right">{fmtSatang(r.base)}</td>
                  <td className="py-1.5 pl-2 text-right">{fmtSatang(r.vat)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-800 font-bold tabular-nums">
                <td colSpan={5} className="py-2 pr-2">
                  รวม ({report.fullCount} ใบเต็มรูป + {report.dailyCount} วันที่ออกอย่างย่อ
                  {report.journalCount > 0 ? ` + ${report.journalCount} รายการจากสมุดรายวัน` : ""})
                </td>
                <td className="py-2 px-2 text-right">{fmtSatang(report.totalBase, { zeroDash: false })}</td>
                <td className="py-2 pl-2 text-right">{fmtSatang(report.totalVat, { zeroDash: false })}</td>
              </tr>
            </tfoot>
          </table>
        </StatementShell>
      )}
    </div>
  );
}
