import Link from "next/link";
import { BarChart3, FileSpreadsheet, Store } from "lucide-react";
import { requireSectionPage } from "@/lib/permissions";
import { ALL_CHANNEL_SALES_SHEETS, resolveAllChannelSalesSheet } from "@/lib/accounting/allChannelSales";

export const dynamic = "force-dynamic";

export default async function AllChannelSalesPage({ searchParams }: { searchParams: { sheet?: string } }) {
  await requireSectionPage("ACCOUNTING");
  const activeSheet = resolveAllChannelSalesSheet(searchParams.sheet);
  const isSummary = activeSheet.key === "summary";

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
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><BarChart3 className="text-pink-600" size={20} /><h2 className="font-semibold text-gray-900">สรุปยอดขายทุกช่องทาง</h2></div>
          <p className="mt-1 text-sm text-gray-500">แต่ละช่องทางจะแสดงยอดเมื่อมีการกำหนดแหล่งข้อมูลหรือนำเข้าข้อมูลในขั้นถัดไป</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {ALL_CHANNEL_SALES_SHEETS.slice(1).map((sheet) => (
              <Link key={sheet.key} href={`/accounting/all-channel-sales?sheet=${sheet.key}`} className="rounded-xl border border-gray-100 bg-gray-50 p-4 hover:border-pink-200 hover:bg-pink-50">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-800"><Store size={16} className="text-pink-500" />{sheet.label}</div>
                <p className="mt-3 text-xs text-gray-400">ยังไม่มีข้อมูล</p>
              </Link>
            ))}
          </div>
        </section>
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
