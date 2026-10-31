import { prisma } from "@lamunn/db-finance";
import { requireSectionPage } from "@/lib/permissions";
import { parseDateOnly } from "@/lib/dates";
import { formatBaht, formatThaiDate, toDateInputValue } from "@/lib/format";
import BranchSalesFilterBar from "@/components/BranchSalesFilterBar";
import ExportPanel from "@/components/ExportPanel";

export const dynamic = "force-dynamic";

function defaultFrom(): string {
  const now = new Date();
  return toDateInputValue(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
}

function defaultTo(): string {
  return toDateInputValue(new Date());
}

/** ยอดขายหน้าร้านของแถวหนึ่ง — สูตรต่างกันตามประเภทสาขา (ดูเหตุผลใน schema.prisma ของ DailySales) */
function storefrontOf(r: { cashPos: number | null; transfer: number | null; cashTransferCombined: number | null }, branchType: string) {
  return branchType === "CASH" ? (r.cashPos ?? 0) + (r.transfer ?? 0) : r.cashTransferCombined ?? 0;
}

export default async function BranchSalesReportPage({
  searchParams,
}: {
  searchParams: { branchId?: string; from?: string; to?: string };
}) {
  await requireSectionPage("REPORTS");

  const branchId = searchParams.branchId ?? "";
  const from = searchParams.from ?? defaultFrom();
  const to = searchParams.to ?? defaultTo();
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);

  const [branches, rows] = await Promise.all([
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, type: true } }),
    prisma.dailySales.findMany({
      where: {
        date: { gte: start, lte: end },
        ...(branchId ? { branchId } : {}),
      },
      orderBy: [{ branchId: "asc" }, { date: "asc" }],
      include: { branch: { select: { id: true, name: true, type: true } } },
    }),
  ]);

  const branchName = branchId ? branches.find((b) => b.id === branchId)?.name ?? "-" : "ทุกสาขา";
  const showBranchColumn = !branchId;

  const tableRows = rows.map((r) => {
    const storefront = storefrontOf(r, r.branch.type);
    return {
      id: r.id,
      branch: r.branch.name,
      date: r.date,
      storefront,
      grab: r.grab,
      lineman: r.lineman,
      shopee: r.shopee,
      total: storefront + r.grab + r.lineman + r.shopee,
    };
  });

  const sum = tableRows.reduce(
    (a, r) => ({ storefront: a.storefront + r.storefront, grab: a.grab + r.grab, lineman: a.lineman + r.lineman, shopee: a.shopee + r.shopee, total: a.total + r.total }),
    { storefront: 0, grab: 0, lineman: 0, shopee: 0, total: 0 }
  );
  // Shopee เริ่ม 30 ต.ค. 2569 — ช่วงที่ไม่มียอด Shopee ไม่ต้องมีคอลัมน์ว่าง
  const hasShopee = sum.shopee !== 0;

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-gray-900">ยอดขายรายสาขา</h1>
      <p className="mb-4 text-sm text-gray-500">เลือกสาขาและช่วงวันที่ ดูยอดขายแต่ละวันแยกช่องทาง (หน้าร้าน / Grab / Lineman) แล้ว Export ออกเป็น Excel ได้</p>

      <BranchSalesFilterBar branches={branches} branchId={branchId} from={from} to={to} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          <span className="font-medium text-gray-800">{branchName}</span> — {formatThaiDate(start)} ถึง {formatThaiDate(end)} ({tableRows.length.toLocaleString()} รายการ)
        </p>
        <ExportPanel
          apiPath="/api/export/branch-sales"
          options={[{ key: "branchSales", label: "ยอดขายรายวันแยกช่องทาง" }]}
          extraParams={{ branchId, from, to }}
        />
      </div>

      <div className={`mb-6 grid grid-cols-2 gap-3 ${hasShopee ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">หน้าร้านรวม</p>
          <p className="mt-1 text-lg font-bold text-gray-800">{formatBaht(sum.storefront)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Grab รวม</p>
          <p className="mt-1 text-lg font-bold text-gray-800">{formatBaht(sum.grab)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Lineman รวม</p>
          <p className="mt-1 text-lg font-bold text-gray-800">{formatBaht(sum.lineman)}</p>
        </div>
        {hasShopee && (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500">Shopee รวม</p>
            <p className="mt-1 text-lg font-bold text-gray-800">{formatBaht(sum.shopee)}</p>
          </div>
        )}
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
          <p className="text-xs text-brand-700">รวมทั้งหมด</p>
          <p className="mt-1 text-lg font-bold text-brand-700">{formatBaht(sum.total)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              {showBranchColumn && <th className="px-4 py-2">สาขา</th>}
              <th className="px-4 py-2">วันที่</th>
              <th className="px-4 py-2 text-right">หน้าร้าน</th>
              <th className="px-4 py-2 text-right">Grab</th>
              <th className="px-4 py-2 text-right">Lineman</th>
              {hasShopee && <th className="px-4 py-2 text-right">Shopee</th>}
              <th className="px-4 py-2 text-right">รวม</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                {showBranchColumn && <td className="px-4 py-2 text-gray-700">{r.branch}</td>}
                <td className="px-4 py-2 text-gray-500">{formatThaiDate(r.date)}</td>
                <td className="px-4 py-2 text-right text-gray-800">{formatBaht(r.storefront)}</td>
                <td className="px-4 py-2 text-right text-gray-800">{formatBaht(r.grab)}</td>
                <td className="px-4 py-2 text-right text-gray-800">{formatBaht(r.lineman)}</td>
                {hasShopee && <td className="px-4 py-2 text-right text-gray-800">{formatBaht(r.shopee)}</td>}
                <td className="px-4 py-2 text-right font-medium text-gray-900">{formatBaht(r.total)}</td>
              </tr>
            ))}
            {tableRows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-gray-400" colSpan={showBranchColumn ? 6 : 5}>
                  ไม่มีข้อมูลตามตัวกรองที่เลือก
                </td>
              </tr>
            )}
          </tbody>
          {tableRows.length > 0 && (
            <tfoot className="border-t-2 border-gray-200 bg-gray-50 text-sm font-bold">
              <tr>
                <td className="px-4 py-2 text-gray-800" colSpan={showBranchColumn ? 2 : 1}>
                  รวมทั้งหมด
                </td>
                <td className="px-4 py-2 text-right text-gray-800">{formatBaht(sum.storefront)}</td>
                <td className="px-4 py-2 text-right text-gray-800">{formatBaht(sum.grab)}</td>
                <td className="px-4 py-2 text-right text-gray-800">{formatBaht(sum.lineman)}</td>
                {hasShopee && <td className="px-4 py-2 text-right text-gray-800">{formatBaht(sum.shopee)}</td>}
                <td className="px-4 py-2 text-right text-brand-700">{formatBaht(sum.total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
