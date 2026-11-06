import Link from "next/link";
import { requireSectionPage } from "@/lib/permissions";
import { getAllSettings } from "@/lib/settings";
import { formatPartnerDisplayName } from "@/lib/accounting/partnerDisplay";
import { loadPurchaseItemReport, purchaseItemReportFilters, PURCHASE_ITEM_CATEGORY_LABELS } from "@/lib/accounting/purchaseItemReport";
import { fmtUnitPriceDecimal } from "@/lib/accounting/purchaseTaxLineItems";
import PrintButton from "@/components/accounting/PrintButton";
import { formatAccountingDate } from "@/lib/accounting/dateFormat";

export const dynamic = "force-dynamic";

export default async function PurchaseItemsPrintPage({ searchParams }: { searchParams: { from?: string; to?: string; category?: string; year?: string; month?: string } }) {
  await requireSectionPage("ACCOUNTING");
  const filters = purchaseItemReportFilters(searchParams);
  const report = await loadPurchaseItemReport(filters.start, filters.end, filters.category);
  const settings = await getAllSettings();
  const query = new URLSearchParams({ from: filters.from, to: filters.to, ...(filters.category ? { category: filters.category } : {}) }).toString();
  const periodLabel = `${formatAccountingDate(filters.from)} – ${formatAccountingDate(filters.to)}`;

  return (
    <div>
      <style>{`
        @page { size: A4 landscape; margin: 10mm; }
        @media print {
          html, body { background: white !important; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
        }
      `}</style>
      <div className="mx-auto mb-4 flex max-w-[297mm] items-center justify-between gap-3 print:hidden">
        <Link href={`/accounting/purchase-items?${query}`} className="text-sm text-gray-500 hover:text-brand-700 hover:underline">← กลับรายงาน</Link>
        <PrintButton label="พิมพ์ / บันทึก PDF" />
      </div>
      <main className="mx-auto min-h-[190mm] w-full max-w-[297mm] bg-white px-8 py-6 text-black shadow-sm print:min-h-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="mb-5 text-center">
          <h1 className="text-xl font-bold">{settings.companyName || "ชื่อบริษัท"}</h1>
          <h2 className="mt-3 text-lg font-bold">รายงานวัตถุดิบ / บรรจุภัณฑ์ / อื่น ๆ</h2>
          <p className="mt-0.5 text-sm">ช่วงวันที่ {periodLabel}{filters.category ? ` · หมวด ${filters.category}` : " · ทุกหมวด"}</p>
        </header>
        <table className="w-full table-fixed border-collapse text-[10px] leading-tight tabular-nums">
          <colgroup><col className="w-[5%]"/><col className="w-[10%]"/><col className="w-[23%]"/><col className="w-[14%]"/><col className="w-[28%]"/><col className="w-[8%]"/><col className="w-[12%]"/></colgroup>
          <thead><tr>{["ลำดับ", "วันที่", "ซัพพลายเออร์", "หมวด", "รายการ", "จำนวน", "ราคาต่อหน่วย"].map((header, index) => <th key={header} className={`border border-black bg-gray-100 px-2 py-2 font-semibold ${index === 0 || index >= 5 ? "text-right" : "text-left"}`}>{header}</th>)}</tr></thead>
          <tbody>
            {report.rows.length === 0 ? <tr><td colSpan={7} className="border border-black px-3 py-8 text-center text-gray-500">ไม่มีรายการในเดือนนี้</td></tr> : report.rows.map((row, index) => (
              <tr key={`${row.invoiceId}-${index}`}>
                <td className="border border-black px-2 py-1.5 text-right">{index + 1}</td>
                <td className="border border-black px-2 py-1.5 whitespace-nowrap">{formatAccountingDate(row.invoiceDate)}</td>
                <td className="border border-black px-2 py-1.5 break-words">{formatPartnerDisplayName(row.vendorName, row.vendorBranchTag)}</td>
                <td className="border border-black px-2 py-1.5">{PURCHASE_ITEM_CATEGORY_LABELS[row.category]}</td>
                <td className="border border-black px-2 py-1.5 break-words">{row.description}</td>
                <td className="border border-black px-2 py-1.5 text-right">{row.quantity}</td>
                <td className="border border-black px-2 py-1.5 text-right">{fmtUnitPriceDecimal(row.unitPriceDecimal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="font-bold"><td colSpan={7} className="border border-black px-2 py-2 text-right">รวม {report.rows.length} รายการ</td></tr></tfoot>
        </table>
      </main>
    </div>
  );
}
