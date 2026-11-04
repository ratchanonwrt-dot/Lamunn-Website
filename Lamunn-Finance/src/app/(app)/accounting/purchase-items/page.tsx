import Link from "next/link";
import { FileSpreadsheet, Printer } from "lucide-react";
import { requireSectionPage } from "@/lib/permissions";
import { getAllSettings } from "@/lib/settings";
import { monthRange } from "@/lib/dates";
import { thaiMonthLabel } from "@/lib/format";
import { fmtSatang } from "@/lib/accounting/money";
import { loadPurchaseItemReport, PURCHASE_ITEM_CATEGORY_LABELS } from "@/lib/accounting/purchaseItemReport";
import MonthFilterBar from "@/components/MonthFilterBar";
import StatementShell from "@/components/accounting/StatementShell";
import { formatPartnerDisplayName } from "@/lib/accounting/partnerDisplay";

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

export default async function PurchaseItemsPage({ searchParams }: { searchParams: { year?: string; month?: string } }) {
  await requireSectionPage("ACCOUNTING");
  const { year, month } = reportPeriod(searchParams);
  const { start, end } = monthRange(year, month - 1);
  const [settings, report] = await Promise.all([getAllSettings(), loadPurchaseItemReport(start, end)]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-bold text-gray-900">วัตถุดิบ / บรรจุภัณฑ์ / อื่น ๆ</h1>
          <p className="text-sm text-gray-500">ดึงจากรายละเอียดที่บันทึกในใบกำกับภาษีซื้อ โดยไม่สร้างรายการบัญชีเพิ่ม</p>
        </div>
        {report.rows.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Link href={`/print/purchase-items?year=${year}&month=${month}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg border border-brand-300 bg-white px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">
              <Printer size={15} /> พิมพ์ / PDF
            </Link>
            <a href={`/api/accounting/purchase-items/export?year=${year}&month=${month}`} className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
              <FileSpreadsheet size={15} /> Export Excel
            </a>
          </div>
        )}
      </div>

      <MonthFilterBar basePath="/accounting/purchase-items" year={year} month={month} />

      {report.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-gray-700">เดือน {thaiMonthLabel(year, month - 1)} ยังไม่มีรายละเอียดวัตถุดิบ บรรจุภัณฑ์ หรือรายการอื่น ๆ</p>
          <p className="mt-1 text-sm text-gray-500">เมื่อบันทึกรายละเอียดในหน้ารายงานภาษีซื้อ รายการจะแสดงที่หน้านี้อัตโนมัติ</p>
        </div>
      ) : (
        <StatementShell companyName={settings.companyName} title="รายงานวัตถุดิบ / บรรจุภัณฑ์ / อื่น ๆ" subtitle={`ประจำเดือน ${thaiMonthLabel(year, month - 1)}`}>
          <table className="w-full min-w-[58rem] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400">
                <th className="w-12 py-2 pr-2 text-right font-medium">ลำดับ</th>
                <th className="px-2 py-2 text-left font-medium">วันที่</th>
                <th className="px-2 py-2 text-left font-medium">ซัพพลายเออร์</th>
                <th className="px-2 py-2 text-left font-medium">หมวด</th>
                <th className="px-2 py-2 text-left font-medium">รายการ</th>
                <th className="px-2 py-2 text-right font-medium">จำนวน</th>
                <th className="px-2 py-2 text-right font-medium">ราคาต่อหน่วย</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {report.rows.map((row, index) => (
                <tr key={`${row.invoiceId}-${index}`} className="border-b border-gray-50">
                  <td className="py-2 pr-2 text-right text-xs text-gray-400">{index + 1}</td>
                  <td className="px-2 py-2 whitespace-nowrap font-mono text-xs text-gray-500">{row.invoiceDate.toISOString().slice(0, 10)}</td>
                  <td className="px-2 py-2 text-gray-800">{formatPartnerDisplayName(row.vendorName, row.vendorBranchTag)}</td>
                  <td className="px-2 py-2"><span className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">{PURCHASE_ITEM_CATEGORY_LABELS[row.category]}</span></td>
                  <td className="px-2 py-2 text-gray-800">{row.description}</td>
                  <td className="px-2 py-2 text-right">{row.quantity}</td>
                  <td className="px-2 py-2 text-right">{fmtSatang(row.unitPriceSatang, { zeroDash: false })}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-800 font-bold tabular-nums">
                <td colSpan={5} className="py-2 pr-2">รวม {report.rows.length} รายการ</td>
                <td className="px-2 py-2 text-right">{report.totalQuantity.toLocaleString("th-TH", { maximumFractionDigits: 4 })}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </StatementShell>
      )}
    </div>
  );
}
