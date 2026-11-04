import Link from "next/link";
import { FileSpreadsheet, Printer } from "lucide-react";
import { requireSectionPage } from "@/lib/permissions";
import { getAllSettings } from "@/lib/settings";
import { loadPurchaseItemReport, purchaseItemReportFilters, PURCHASE_ITEM_CATEGORY_LABELS } from "@/lib/accounting/purchaseItemReport";
import { fmtUnitPriceSubSatang } from "@/lib/accounting/purchaseTaxLineItems";
import StatementShell from "@/components/accounting/StatementShell";
import { formatPartnerDisplayName } from "@/lib/accounting/partnerDisplay";

export const dynamic = "force-dynamic";

function queryString(filters: { from: string; to: string; category: string }) {
  const query = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.category) query.set("category", filters.category);
  return query.toString();
}

export default async function PurchaseItemsPage({ searchParams }: { searchParams: { from?: string; to?: string; category?: string; year?: string; month?: string } }) {
  await requireSectionPage("ACCOUNTING");
  const filters = purchaseItemReportFilters(searchParams);
  const [settings, report] = await Promise.all([getAllSettings(), loadPurchaseItemReport(filters.start, filters.end, filters.category)]);
  const query = queryString(filters);
  const periodLabel = `${filters.from.split("-").reverse().join("/")} – ${filters.to.split("-").reverse().join("/")}`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-bold text-gray-900">วัตถุดิบ / บรรจุภัณฑ์ / อื่น ๆ</h1>
          <p className="text-sm text-gray-500">ดึงจากรายละเอียดที่บันทึกในใบกำกับภาษีซื้อ โดยไม่สร้างรายการบัญชีเพิ่ม</p>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <form method="get" className="grid items-end gap-3 md:grid-cols-[1fr_1fr_1.3fr_auto]">
          <label className="text-sm text-gray-600">วันที่เริ่มต้น<input type="date" name="from" defaultValue={filters.from} className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-gray-900" /></label>
          <label className="text-sm text-gray-600">วันที่สิ้นสุด<input type="date" name="to" defaultValue={filters.to} className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-gray-900" /></label>
          <label className="text-sm text-gray-600">หมวด (พิมพ์เพื่อกรอง)<input name="category" list="purchase-item-categories" defaultValue={filters.category} placeholder="ทุกหมวด" className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-gray-900" /><datalist id="purchase-item-categories">{Object.values(PURCHASE_ITEM_CATEGORY_LABELS).map((label) => <option key={label} value={label} />)}</datalist></label>
          <button className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700">แสดงรายงาน</button>
        </form>
        {report.rows.length > 0 && <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-3">
          <Link href={`/print/purchase-items?${query}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg border border-brand-300 bg-white px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"><Printer size={15} /> พิมพ์ / PDF</Link>
          <a href={`/api/accounting/purchase-items/export?${query}`} className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"><FileSpreadsheet size={15} /> Export Excel</a>
        </div>}
      </div>

      {report.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-gray-700">ช่วงวันที่ {periodLabel} ยังไม่มีรายละเอียดที่ตรงกับตัวกรอง</p>
          <p className="mt-1 text-sm text-gray-500">เมื่อบันทึกรายละเอียดในหน้ารายงานภาษีซื้อ รายการจะแสดงที่หน้านี้อัตโนมัติ</p>
        </div>
      ) : (
        <StatementShell companyName={settings.companyName} title="รายงานวัตถุดิบ / บรรจุภัณฑ์ / อื่น ๆ" subtitle={`ช่วงวันที่ ${periodLabel}${filters.category ? ` · หมวด ${filters.category}` : " · ทุกหมวด"}`}>
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
                  <td className="px-2 py-2 text-right">{fmtUnitPriceSubSatang(row.unitPriceSubSatang)}</td>
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
