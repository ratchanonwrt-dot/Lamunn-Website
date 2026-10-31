import Link from "next/link";
import { prisma } from "@lamunn/db-finance";
import { requireSectionPage } from "@/lib/permissions";
import { parseDateOnly } from "@/lib/dates";
import { formatBaht, formatPercent, formatThaiDate, toDateInputValue } from "@/lib/format";
import RankingFilterBar from "@/components/RankingFilterBar";

type SortKey = "total" | "storefront" | "delivery";

export default async function BranchRankingPage({
  searchParams,
}: {
  searchParams: { start?: string; end?: string; sort?: string };
}) {
  await requireSectionPage("REPORTS");
  const now = new Date();
  const defaultStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = searchParams.start ? parseDateOnly(searchParams.start) : defaultStart;
  const endRaw = searchParams.end ? parseDateOnly(searchParams.end) : now;
  const end = endRaw > now ? now : endRaw;
  const sort: SortKey = searchParams.sort === "storefront" || searchParams.sort === "delivery" ? searchParams.sort : "total";
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);

  // ไม่กรอง isActive — สาขาที่ปิดไปแล้วอาจยังมียอดขายจริงอยู่ในช่วงที่เลือกดู
  const [branches, salesAgg] = await Promise.all([
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, type: true, isActive: true } }),
    prisma.dailySales.groupBy({
      by: ["branchId"],
      where: { date: { gte: start, lte: end } },
      _sum: { cashPos: true, transfer: true, cashTransferCombined: true, grab: true, lineman: true, shopee: true },
    }),
  ]);
  const salesByBranch = new Map(salesAgg.map((s) => [s.branchId, s._sum]));

  const rows = branches.map((b) => {
    const s = salesByBranch.get(b.id);
    const storefront = b.type === "CASH" ? (s?.cashPos ?? 0) + (s?.transfer ?? 0) : s?.cashTransferCombined ?? 0;
    const delivery = (s?.grab ?? 0) + (s?.lineman ?? 0) + (s?.shopee ?? 0);
    const total = storefront + delivery;
    return { branch: b, storefront, delivery, total };
  });

  const grand = rows.reduce(
    (acc, r) => ({ storefront: acc.storefront + r.storefront, delivery: acc.delivery + r.delivery, total: acc.total + r.total }),
    { storefront: 0, delivery: 0, total: 0 }
  );

  const ranked = [...rows].sort((a, b) => b[sort] - a[sort]);
  const maxValue = Math.max(1, ...ranked.map((r) => r[sort]));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-800">อันดับยอดขายรายสาขา</h1>
        <Link href="/reports" className="text-sm text-brand-600 hover:underline">
          ← กลับไปหน้ารายงาน/วิเคราะห์
        </Link>
      </div>

      <RankingFilterBar
        basePath="/reports/ranking"
        start={toDateInputValue(start)}
        end={toDateInputValue(end)}
        sort={sort}
      />

      <p className="mb-4 text-xs text-gray-400">
        ช่วง {formatThaiDate(start)} – {formatThaiDate(end)} ({days} วัน)
      </p>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">ยอดขายรวมทั้งหมด</p>
          <p className="mt-1 text-lg font-bold text-brand-700">{formatBaht(grand.total)} บาท</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">หน้าร้าน (Storefront)</p>
          <p className="mt-1 text-lg font-bold text-gray-800">{formatBaht(grand.storefront)} บาท</p>
          <p className="mt-0.5 text-[11px] text-gray-400">{grand.total ? formatPercent(grand.storefront / grand.total) : "-"} ของยอดรวม</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Delivery (Grab + Lineman)</p>
          <p className="mt-1 text-lg font-bold text-gray-800">{formatBaht(grand.delivery)} บาท</p>
          <p className="mt-0.5 text-[11px] text-gray-400">{grand.total ? formatPercent(grand.delivery / grand.total) : "-"} ของยอดรวม</p>
        </div>
      </div>

      {/* มือถือ: การ์ดรายการ */}
      <div className="flex flex-col gap-2 sm:hidden">
        {ranked.map((r, i) => (
          <div key={r.branch.id} className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium text-gray-800">
                <span className="text-xs text-gray-400">#{i + 1}</span>
                {r.branch.name}
                {!r.branch.isActive && <span className="text-xs font-normal text-gray-400">(ปิด)</span>}
              </span>
              <span className="text-xs text-gray-400">{r.total ? formatPercent(r.total / (grand.total || 1)) : "-"}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(2, (r[sort] / maxValue) * 100)}%` }} />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-gray-400">หน้าร้าน</p>
                <p className="font-medium text-gray-700">{formatBaht(r.storefront)}</p>
              </div>
              <div>
                <p className="text-gray-400">Delivery</p>
                <p className="font-medium text-gray-700">{formatBaht(r.delivery)}</p>
              </div>
              <div>
                <p className="text-gray-400">รวม</p>
                <p className="font-semibold text-gray-800">{formatBaht(r.total)}</p>
              </div>
            </div>
          </div>
        ))}
        {ranked.length === 0 && <p className="text-center text-sm text-gray-400">ไม่มีข้อมูล</p>}
      </div>

      {/* จอใหญ่: ตาราง */}
      <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white sm:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2">อันดับ</th>
              <th className="px-3 py-2">สาขา</th>
              <th className="px-3 py-2 text-right">หน้าร้าน</th>
              <th className="px-3 py-2 text-right">Delivery</th>
              <th className="px-3 py-2 text-right">รวม</th>
              <th className="px-3 py-2 text-right">% ของยอดรวม</th>
              <th className="px-3 py-2">สัดส่วน</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r, i) => (
              <tr key={r.branch.id} className="border-t border-gray-100">
                <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                <td className="px-3 py-2 font-medium text-gray-800">
                  {r.branch.name}
                  {!r.branch.isActive && <span className="ml-1.5 text-xs font-normal text-gray-400">(ปิดสาขาแล้ว)</span>}
                </td>
                <td className="px-3 py-2 text-right">{formatBaht(r.storefront)}</td>
                <td className="px-3 py-2 text-right">{formatBaht(r.delivery)}</td>
                <td className="px-3 py-2 text-right font-semibold text-brand-700">{formatBaht(r.total)}</td>
                <td className="px-3 py-2 text-right text-gray-500">{r.total ? formatPercent(r.total / (grand.total || 1)) : "-"}</td>
                <td className="px-3 py-2">
                  <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(2, (r[sort] / maxValue) * 100)}%` }} />
                  </div>
                </td>
              </tr>
            ))}
            {ranked.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-gray-400" colSpan={7}>
                  ไม่มีข้อมูล
                </td>
              </tr>
            )}
          </tbody>
          {ranked.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                <td className="px-3 py-2" colSpan={2}>
                  รวมทั้งหมด ({ranked.length} สาขา)
                </td>
                <td className="px-3 py-2 text-right">{formatBaht(grand.storefront)}</td>
                <td className="px-3 py-2 text-right">{formatBaht(grand.delivery)}</td>
                <td className="px-3 py-2 text-right">{formatBaht(grand.total)}</td>
                <td className="px-3 py-2" colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
