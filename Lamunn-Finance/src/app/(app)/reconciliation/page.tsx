import { prisma, getPosDailyTotals } from "@lamunn/db-finance";
import { requireSectionPage } from "@/lib/permissions";
import MonthFilterBar from "@/components/MonthFilterBar";
import { monthRange } from "@/lib/dates";
import { formatBaht, formatThaiDate } from "@/lib/format";

const EPSILON = 0.01;

export default async function ReconciliationPage({ searchParams }: { searchParams: { year?: string; month?: string } }) {
  await requireSectionPage("RECONCILIATION");
  const now = new Date();
  const year = Number(searchParams.year) || now.getUTCFullYear();
  const month = Number(searchParams.month) || now.getUTCMonth() + 1;
  const { start, end } = monthRange(year, month - 1);
  const clampedEnd = end > now ? now : end;

  // 5 คำถามนี้ไม่ขึ้นกับกันเลย ยิงพร้อมกันรอบเดียวแทนที่จะแยกเป็น 2 รอบ (rows เดี่ยวๆ ก่อน แล้วค่อย 4 คำถามที่เหลือ)
  const [rows, posBranches, totalBranchCount, posTotalsMap, ourSalesInRange] = await Promise.all([
    prisma.dailySales.findMany({
      where: { date: { gte: start, lte: end }, posCheckTotal: { not: null } },
      include: { branch: { select: { name: true, type: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.branch.findMany({ where: { posCode: { not: null } }, select: { id: true, name: true, type: true, posCode: true } }),
    prisma.branch.count(),
    getPosDailyTotals(start, clampedEnd),
    prisma.dailySales.findMany({ where: { date: { gte: start, lte: clampedEnd } } }),
  ]);

  const checked = rows.map((r) => {
    const storefront = r.branch.type === "CASH" ? (r.cashPos ?? 0) + (r.transfer ?? 0) : r.cashTransferCombined ?? 0;
    const computedTotal = storefront + r.grab + r.lineman + r.shopee;
    const posTotal = r.posCheckTotal ?? 0;
    const diff = posTotal - computedTotal;
    return { ...r, computedTotal, posTotal, diff };
  });

  const mismatches = checked.filter((r) => Math.abs(r.diff) > EPSILON).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const matched = checked.length - mismatches.length;

  // --- เทียบยอดกับระบบ POS ของเพื่อน (ดึงสด real-time จาก public.pos_bills) ---
  const ourSalesMap = new Map(ourSalesInRange.map((r) => [`${r.branchId}_${r.date.toISOString().slice(0, 10)}`, r]));

  const liveRows: {
    date: string;
    branchName: string;
    posTotal: number;
    billCount: number;
    ourTotal: number;
    diff: number;
  }[] = [];
  for (const b of posBranches) {
    for (const [key, pos] of posTotalsMap) {
      if (pos.posCode !== b.posCode) continue;
      const our = ourSalesMap.get(`${b.id}_${pos.date}`);
      const ourTotal = our ? (b.type === "CASH" ? (our.cashPos ?? 0) + (our.transfer ?? 0) : our.cashTransferCombined ?? 0) + our.grab + our.lineman + our.shopee : 0;
      liveRows.push({ date: pos.date, branchName: b.name, posTotal: pos.total, billCount: pos.billCount, ourTotal, diff: pos.total - ourTotal });
    }
  }
  liveRows.sort((a, b) => (a.date === b.date ? a.branchName.localeCompare(b.branchName) : a.date.localeCompare(b.date)));
  const liveMismatches = liveRows.filter((r) => Math.abs(r.diff) > EPSILON);

  return (
    <div>
      <h1 className="mb-2 text-xl font-bold text-gray-800">เช็คยอด POS — เทียบยอดที่กรอกกับยอดรวม POS</h1>
      <p className="mb-6 text-sm text-gray-500">
        เทียบยอดที่พนักงานกรอกแยกจาก 3 แอพ (POS/Lineman/Grab) กับยอดรวม POS ที่กรอกไว้ในช่อง &quot;ยอดรวม POS (เช็คยอด)&quot; ของแต่ละวัน —
        ถ้ามีผลต่างแปลว่ากรอกข้อมูลผิดหรือยอดไม่ตรงกัน
      </p>

      <MonthFilterBar basePath="/reconciliation" year={year} month={month} />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">วันที่มีข้อมูลเช็คยอด</p>
          <p className="mt-1 text-lg font-bold text-gray-800">{checked.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">ตรงกัน</p>
          <p className="mt-1 text-lg font-bold text-emerald-600">{matched}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">ไม่ตรง (ต้องตรวจสอบ)</p>
          <p className="mt-1 text-lg font-bold text-red-600">{mismatches.length}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2">วันที่</th>
              <th className="px-3 py-2">สาขา</th>
              <th className="px-3 py-2 text-right">ยอดที่กรอก (POS+Grab+Lineman)</th>
              <th className="px-3 py-2 text-right">ยอดรวม POS</th>
              <th className="px-3 py-2 text-right">ผลต่าง</th>
            </tr>
          </thead>
          <tbody>
            {mismatches.map((r) => (
              <tr key={r.id} className="border-t border-gray-100 bg-red-50/50">
                <td className="px-3 py-2">{formatThaiDate(r.date)}</td>
                <td className="px-3 py-2 font-medium text-gray-800">{r.branch.name}</td>
                <td className="px-3 py-2 text-right">{formatBaht(r.computedTotal)}</td>
                <td className="px-3 py-2 text-right">{formatBaht(r.posTotal)}</td>
                <td className="px-3 py-2 text-right font-semibold text-red-600">{formatBaht(r.diff)}</td>
              </tr>
            ))}
            {mismatches.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-gray-400" colSpan={5}>
                  {checked.length === 0 ? "ยังไม่มีการกรอกยอดรวม POS ในเดือนนี้" : "ยอดตรงกันทั้งหมด ✓"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 mt-10 text-lg font-bold text-gray-800">เทียบยอดกับระบบ POS ของเพื่อน (ดึงสด real-time)</h2>
      <p className="mb-6 text-sm text-gray-500">
        ดึงยอดขายจริงจากระบบ POS ที่ร้านใช้ (ผ่าน public.pos_bills) มาเทียบกับยอดที่กรอกไว้ในระบบนี้โดยอัตโนมัติ ไม่ต้องพิมพ์ยอดรวม POS เอง —
        ใช้ได้เฉพาะสาขาที่เชื่อมกับ POS แล้ว ({posBranches.length}/{totalBranchCount} สาขา)
      </p>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">วันที่มีข้อมูลจาก POS</p>
          <p className="mt-1 text-lg font-bold text-gray-800">{liveRows.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">ตรงกัน</p>
          <p className="mt-1 text-lg font-bold text-emerald-600">{liveRows.length - liveMismatches.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">ไม่ตรง (ต้องตรวจสอบ)</p>
          <p className="mt-1 text-lg font-bold text-red-600">{liveMismatches.length}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2">วันที่</th>
              <th className="px-3 py-2">สาขา</th>
              <th className="px-3 py-2 text-right">ยอด POS จริง (Live)</th>
              <th className="px-3 py-2 text-right">จำนวนบิล</th>
              <th className="px-3 py-2 text-right">ยอดที่กรอกในระบบนี้</th>
              <th className="px-3 py-2 text-right">ผลต่าง</th>
            </tr>
          </thead>
          <tbody>
            {liveRows.map((r) => (
              <tr key={`${r.date}_${r.branchName}`} className={`border-t border-gray-100 ${Math.abs(r.diff) > EPSILON ? "bg-red-50/50" : ""}`}>
                <td className="px-3 py-2">{formatThaiDate(new Date(r.date))}</td>
                <td className="px-3 py-2 font-medium text-gray-800">{r.branchName}</td>
                <td className="px-3 py-2 text-right">{formatBaht(r.posTotal)}</td>
                <td className="px-3 py-2 text-right text-gray-500">{r.billCount}</td>
                <td className="px-3 py-2 text-right">{formatBaht(r.ourTotal)}</td>
                <td className={`px-3 py-2 text-right font-semibold ${Math.abs(r.diff) > EPSILON ? "text-red-600" : "text-gray-400"}`}>
                  {formatBaht(r.diff)}
                </td>
              </tr>
            ))}
            {liveRows.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-gray-400" colSpan={6}>
                  ยังไม่มีข้อมูลจากระบบ POS ของเพื่อนในเดือนนี้
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
