import Link from "next/link";
import { prisma } from "@lamunn/db-finance";
import { requireSectionPage } from "@/lib/permissions";
import { monthRange } from "@/lib/dates";
import { thaiMonthLabel } from "@/lib/format";
import { getAllSettings } from "@/lib/settings";
import MonthFilterBar from "@/components/MonthFilterBar";
import TaxReportTabs from "@/components/accounting/TaxReportTabs";
import StatementShell from "@/components/accounting/StatementShell";
import PurchaseTaxInvoiceForm from "@/components/accounting/PurchaseTaxInvoiceForm";
import VoidDocButton from "@/components/accounting/VoidDocButton";
import EditPurchaseInvoiceButton from "@/components/accounting/EditPurchaseInvoiceButton";
import { FileSpreadsheet, Printer } from "lucide-react";
import { buildInputVatReport } from "@/lib/accounting/taxReports";
import { fmtSatang } from "@/lib/accounting/money";

export const dynamic = "force-dynamic";

export default async function InputVatPage({ searchParams }: { searchParams: { year?: string; month?: string } }) {
  const { permissions } = await requireSectionPage("ACCOUNTING");
  const canEdit = permissions.ACCOUNTING.canEdit;

  const now = new Date();
  const year = Number(searchParams.year) || now.getUTCFullYear();
  const month = Number(searchParams.month) || now.getUTCMonth() + 1;
  const { start, end } = monthRange(year, month - 1);

  const [settings, report, partners, expenseAccounts, creditAccounts] = await Promise.all([
    getAllSettings(),
    buildInputVatReport(start, end),
    prisma.accPartner.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, phone: true, taxId: true, address: true },
    }),
    // บัญชีสำหรับสร้างใบสำคัญให้อัตโนมัติ — เดบิตเป็นค่าใช้จ่าย/สินทรัพย์ เครดิตเป็นเงิน/เจ้าหนี้
    prisma.accAccount.findMany({
      where: { isActive: true, isPostable: true, type: { in: ["EXPENSE", "ASSET"] }, vatRole: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true, nameTh: true },
    }),
    prisma.accAccount.findMany({
      where: { isActive: true, isPostable: true, type: { in: ["ASSET", "LIABILITY"] }, vatRole: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true, nameTh: true },
    }),
  ]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-bold text-gray-900">รายงานภาษีซื้อ</h1>
          <p className="text-sm text-gray-500">
            ใบกำกับภาษีที่ผู้ขายออกให้เรา — ใช้แนบไปกับ ภ.พ.30 · รวมรายการที่บัญชีคีย์เองในสมุดรายวันแล้วแตะบัญชีภาษีซื้อด้วย
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {report.rows.length > 0 && (
            <>
              <Link
                href={`/print/input-vat?year=${year}&month=${month}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-brand-300 bg-white px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
              >
                <Printer size={15} /> พิมพ์ / PDF
              </Link>
              <a
                href={`/api/accounting/tax-reports/input-vat/export?year=${year}&month=${month}`}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
              >
                <FileSpreadsheet size={15} /> Export Excel
              </a>
            </>
          )}
          {canEdit && (
            <PurchaseTaxInvoiceForm
              partners={partners}
              expenseAccounts={expenseAccounts}
              creditAccounts={creditAccounts}
              vatRate={Number(settings.vatRate)}
            />
          )}
        </div>
      </div>

      <TaxReportTabs />
      <MonthFilterBar basePath="/accounting/tax-reports/input-vat" year={year} month={month} />

      {report.nonClaimableVat !== 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          มีภาษีซื้อต้องห้าม {fmtSatang(report.nonClaimableVat, { zeroDash: false })} บาทในเดือนนี้ —
          แสดงในรายงานตามปกติ แต่ไม่ถูกนำไปหักใน ภ.พ.30
        </div>
      )}

      {report.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-gray-700">
            เดือน {thaiMonthLabel(year, month - 1)} ยังไม่มีทั้งใบกำกับภาษีซื้อและรายการภาษีซื้อในสมุดรายวัน
          </p>
          {canEdit && <p className="mt-1 text-sm text-gray-500">กด &ldquo;บันทึกใบกำกับภาษีซื้อ&rdquo; ด้านบนเพื่อเริ่มบันทึก</p>}
        </div>
      ) : (
        <StatementShell
          companyName={settings.companyName}
          title="รายงานภาษีซื้อ"
          subtitle={`สำหรับเดือนภาษี ${thaiMonthLabel(year, month - 1)}`}
        >
          <table className="w-full min-w-[60rem] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400">
                <th className="w-12 py-2 pr-2 text-right font-medium">ลำดับ</th>
                <th className="py-2 px-2 text-left font-medium">วันที่</th>
                <th className="py-2 px-2 text-left font-medium">เลขที่ใบกำกับ</th>
                <th className="py-2 px-2 text-left font-medium">ชื่อผู้ขาย</th>
                <th className="py-2 px-2 text-left font-medium">เลขผู้เสียภาษี</th>
                <th className="py-2 px-2 text-right font-medium">มูลค่าสินค้า/บริการ</th>
                <th className="py-2 px-2 text-right font-medium">ภาษีซื้อ</th>
                {canEdit && <th className="py-2 pl-2" />}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {report.rows.map((r, i) => (
                <tr key={r.id} className="border-b border-gray-50">
                  <td className="py-1.5 pr-2 text-right text-xs text-gray-400">{i + 1}</td>
                  <td className="py-1.5 px-2 font-mono text-xs text-gray-500">{r.date.toISOString().slice(0, 10)}</td>
                  <td className="py-1.5 px-2 font-mono text-xs text-gray-700">
                    {/* แถวจากสมุดรายวันโชว์เลขที่ใบกำกับที่กรอกไว้ที่บรรทัดเท่านั้น — เลขที่ใบสำคัญเป็นแค่ป้ายอ้างอิง */}
                    {r.invoiceNo ? (
                      r.invoiceNo
                    ) : (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 font-sans text-amber-700">ยังไม่ใส่เลขที่ใบกำกับ</span>
                    )}
                    {r.kind === "JOURNAL" && (
                      <span className="ml-1.5 whitespace-nowrap rounded bg-indigo-100 px-1.5 py-0.5 font-sans text-xs text-indigo-700">
                        สมุดรายวัน {r.entryNo}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-gray-800">
                    {r.vendorName}
                    {r.branchTag && <span className="ml-1.5 text-xs text-gray-400">({r.branchTag})</span>}
                    {!r.isClaimable && (
                      <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">ต้องห้าม</span>
                    )}
                    <span className="ml-1.5 text-xs text-gray-400">{r.description}</span>
                  </td>
                  <td className="py-1.5 px-2 font-mono text-xs text-gray-500">{r.taxId ?? "-"}</td>
                  <td className="py-1.5 px-2 text-right">{fmtSatang(r.base)}</td>
                  <td className="py-1.5 px-2 text-right">{fmtSatang(r.vat)}</td>
                  {canEdit && (
                    <td className="py-1.5 pl-2 text-right print:hidden">
                      {/* แถวจากสมุดรายวันไม่มีเอกสารให้ยกเลิก — ต้องไปแก้ที่ใบสำคัญต้นทางแทน */}
                      {r.kind === "DOC" ? (
                        <span className="inline-flex gap-1.5">
                          <EditPurchaseInvoiceButton id={r.id} />
                          <VoidDocButton endpoint="/api/accounting/purchase-tax-invoices" id={r.id} />
                        </span>
                      ) : (
                        <Link
                          href={`/accounting/journal?year=${year}&month=${month}&q=${encodeURIComponent(r.entryNo ?? "")}`}
                          className="whitespace-nowrap rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50"
                        >
                          {r.invoiceNo ? "ดูใบสำคัญ" : "ไปใส่เลขที่"}
                        </Link>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-800 font-bold tabular-nums">
                <td colSpan={5} className="py-2 pr-2">
                  รวม {report.rows.length} รายการ
                  {report.journalCount > 0 ? ` (${report.docCount} ใบกำกับ + ${report.journalCount} จากสมุดรายวัน)` : ""}
                </td>
                <td className="py-2 px-2 text-right">{fmtSatang(report.totalBase, { zeroDash: false })}</td>
                <td className="py-2 px-2 text-right">{fmtSatang(report.totalVat, { zeroDash: false })}</td>
                {canEdit && <td className="print:hidden" />}
              </tr>
              {report.nonClaimableVat !== 0 && (
                <tr className="tabular-nums text-sm text-gray-600">
                  <td colSpan={6} className="py-1.5 pr-2 text-right">
                    ในจำนวนนี้ ขอเครดิตได้
                  </td>
                  <td className="py-1.5 px-2 text-right font-semibold">{fmtSatang(report.claimableVat, { zeroDash: false })}</td>
                  {canEdit && <td className="print:hidden" />}
                </tr>
              )}
            </tfoot>
          </table>
        </StatementShell>
      )}
    </div>
  );
}
