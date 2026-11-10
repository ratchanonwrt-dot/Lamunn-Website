import Link from "next/link";
import { ArrowRight, BarChart3, FileSpreadsheet, ReceiptText } from "lucide-react";
import { requireSectionPage } from "@/lib/permissions";
import { ALL_CHANNEL_SALES_CASH_BRANCHES, ALL_CHANNEL_SALES_LINKS, ALL_CHANNEL_SALES_POS_COLUMNS, ALL_CHANNEL_SALES_SHEETS, ALL_CHANNEL_SALES_SUMMARY_COLUMNS, resolveAllChannelSalesSheet } from "@/lib/accounting/allChannelSales";
import { loadAllChannelCashReport } from "@/lib/accounting/allChannelCash";
import { AllChannelCashSheet } from "@/components/accounting/AllChannelCashSheet";

export const dynamic = "force-dynamic";

export default async function AllChannelSalesPage({ searchParams }: { searchParams: { sheet?: string; year?: string; month?: string } }) {
  await requireSectionPage("ACCOUNTING");
  const activeSheet = resolveAllChannelSalesSheet(searchParams.sheet);
  const isSummary = activeSheet.key === "summary";
  const isPos = activeSheet.key === "pos";
  const isCash = activeSheet.key === "cash";
  const now = new Date();
  const year = /^20\d{2}$/.test(searchParams.year ?? "") ? Number(searchParams.year) : now.getFullYear();
  const requestedMonth = Number(searchParams.month);
  const month = Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12 ? requestedMonth : now.getMonth() + 1;
  const cashReport = isCash ? await loadAllChannelCashReport(year, month) : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">ขายทุกช่องทาง</h1>
        <p className="mt-1 text-sm text-gray-500">พื้นที่รวมยอดขายแยกตามช่องทาง โดยยังไม่สร้างรายการบัญชีจนกว่าจะตรวจสอบข้อมูลครบ</p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
        <div className="flex min-w-max gap-1.5">
          {ALL_CHANNEL_SALES_SHEETS.map((sheet) => {
            const active = sheet.key === activeSheet.key;
            return (
              <Link
                key={sheet.key}
                href={`/accounting/all-channel-sales?sheet=${sheet.key}`}
                className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${active ? "bg-pink-600 text-white shadow-sm" : "bg-pink-50 text-pink-700 hover:bg-pink-100"}`}
              >
                {sheet.label}
              </Link>
            );
          })}
        </div>
      </div>

      {isSummary ? (
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <div><div className="flex items-center gap-2"><BarChart3 className="text-pink-600" size={20} /><h2 className="font-semibold text-gray-900">สรุปยอดขาย</h2></div><p className="mt-1 text-sm text-gray-500">สรุปมูลค่าขายและภาษีมูลค่าเพิ่มแยกตามสาขา</p></div>
            <Link href={ALL_CHANNEL_SALES_LINKS.taxInvoices} className="inline-flex items-center gap-2 rounded-xl bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700"><ReceiptText size={16} />เปิดใบกำกับภาษีเต็มรูป<ArrowRight size={15} /></Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs font-medium text-gray-500">
                <tr>{ALL_CHANNEL_SALES_SUMMARY_COLUMNS.map((column, index) => <th key={column} className={`px-4 py-3 ${index < 2 ? "text-left" : "text-right"}`}>{column}</th>)}</tr>
              </thead>
              <tbody><tr><td colSpan={ALL_CHANNEL_SALES_SUMMARY_COLUMNS.length} className="px-4 py-14 text-center text-gray-400">ยังไม่มีข้อมูลยอดขายรายสาขา</td></tr></tbody>
              <tfoot className="border-t border-gray-200 bg-pink-50 font-semibold text-gray-800">
                <tr><td className="px-4 py-3" /><td className="px-4 py-3">รวม</td><td className="px-4 py-3 text-right">0.00</td><td className="px-4 py-3 text-right">0.00</td><td className="px-4 py-3 text-right">0.00</td></tr>
              </tfoot>
            </table>
          </div>
        </section>
      ) : isPos ? (
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <div><h2 className="font-semibold text-gray-900">POS</h2><p className="mt-0.5 text-sm text-gray-500">สรุปมูลค่ารวมภาษีจากระบบ POS แยกตามช่องทางและสาขา</p></div>
            <Link href={ALL_CHANNEL_SALES_LINKS.summary} className="inline-flex items-center gap-2 rounded-xl border border-pink-200 bg-pink-50 px-4 py-2 text-sm font-medium text-pink-700 hover:bg-pink-100"><BarChart3 size={16} />ไปสรุปยอดขาย<ArrowRight size={15} /></Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs font-medium text-gray-500">
                <tr>{ALL_CHANNEL_SALES_POS_COLUMNS.map((column, index) => <th key={column} className={`px-4 py-3 ${index < 3 ? "text-left" : "text-right"}`}>{column}</th>)}</tr>
              </thead>
              <tbody><tr><td colSpan={ALL_CHANNEL_SALES_POS_COLUMNS.length} className="px-4 py-14 text-center text-gray-400">ยังไม่มีข้อมูล POS</td></tr></tbody>
              <tfoot className="border-t border-gray-200 bg-pink-50 font-semibold text-gray-800">
                <tr><td className="px-4 py-3" /><td colSpan={2} className="px-4 py-3">ยอดรวมทั้งสิ้น</td><td className="px-4 py-3 text-right">0.00</td></tr>
              </tfoot>
            </table>
          </div>
        </section>
      ) : isCash ? (
        <AllChannelCashSheet initialReport={cashReport!} fallbackBranches={ALL_CHANNEL_SALES_CASH_BRANCHES} />
      ) : (
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <div><h2 className="font-semibold text-gray-900">{activeSheet.label}</h2><p className="mt-0.5 text-sm text-gray-500">รายการยอดขายของช่องทาง {activeSheet.label}</p></div>
            <FileSpreadsheet size={20} className="text-pink-500" />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500"><tr><th className="px-4 py-3">วันที่</th><th className="px-4 py-3">รายการ</th><th className="px-4 py-3">สาขา</th><th className="px-4 py-3 text-right">ยอดขาย</th><th className="px-4 py-3 text-right">ค่าธรรมเนียม</th><th className="px-4 py-3 text-right">ยอดรับสุทธิ</th><th className="px-4 py-3">สถานะ</th></tr></thead>
              <tbody><tr><td colSpan={7} className="px-4 py-14 text-center text-gray-400">ยังไม่มีข้อมูลใน sheet {activeSheet.label}</td></tr></tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
