import Link from "next/link";
import { prisma } from "@lamunn/db-finance";
import { requireSectionPage } from "@/lib/permissions";
import AddHeldDepositForm from "@/components/AddHeldDepositForm";
import DeleteHeldDepositButton from "@/components/DeleteHeldDepositButton";
import EditDepositDateCell from "@/components/EditDepositDateCell";
import HeldDepositStatusBadge from "@/components/HeldDepositStatusBadge";
import HeldDepositVatSelect from "@/components/HeldDepositVatSelect";
import { formatBaht } from "@/lib/format";
import { isStillHeld, refundableDepositTotal } from "@/lib/heldDepositCalc";

export default async function HeldDepositsPage({ searchParams }: { searchParams: { sort?: string; dir?: string } }) {
  await requireSectionPage("HELD_DEPOSITS");

  // เรียงตามวันที่มัดจำได้จากหัวตาราง (?sort=deposited&dir=asc|desc) — แถวที่ไม่ได้กรอกวันที่ไปอยู่ท้ายเสมอ
  const sortByDeposited = searchParams.sort === "deposited";
  const dir = searchParams.dir === "asc" ? "asc" : "desc";
  const deposits = await prisma.heldDeposit.findMany({
    orderBy: sortByDeposited ? { depositedAt: { sort: dir, nulls: "last" } } : { createdAt: "desc" },
  });

  // รายการที่ "ได้คืนแล้ว" ไม่นับในยอดรวม (เงินกลับเข้าบริษัทแล้ว) — แสดงแยกไว้ดูอย่างเดียว
  const total = deposits.filter(isStillHeld).reduce((a, d) => a + d.amount, 0);
  const returned = deposits.filter((d) => !isStillHeld(d));
  const returnedTotal = returned.reduce((a, d) => a + d.amount, 0);
  // สูตรเดียวกับหน้าสถานะการเงินบริษัท — ดู src/lib/heldDepositCalc.ts
  const { refundExVat, sumIncVat, sumExVat, sumNoVat, sumUnspecified } = refundableDepositTotal(deposits);

  const nextDir = sortByDeposited && dir === "desc" ? "asc" : "desc";

  return (
    <div>
      <h1 className="mb-2 text-xl font-bold text-gray-800">เงินมัดจำ</h1>
      <p className="mb-6 text-sm text-gray-500">บันทึกว่ามัดจำเงินไว้ที่ไหนบ้าง จำนวนเท่าไหร่ — กรอกเองทั้งหมด</p>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">ยอดเงินมัดจำรวมทั้งหมด</p>
          <p className="mt-1 text-xl font-bold text-brand-700">{formatBaht(total)} บาท</p>
          {returnedTotal > 0 && (
            <p className="mt-0.5 text-[11px] text-emerald-600">
              ไม่รวมที่ได้คืนแล้ว {formatBaht(returnedTotal)} บาท ({returned.length} รายการ)
            </p>
          )}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-emerald-600">รวม VAT</p>
          <p className="mt-1 text-xl font-bold text-emerald-700">{formatBaht(sumIncVat)} บาท</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-sky-600">ไม่รวม VAT</p>
          <p className="mt-1 text-xl font-bold text-sky-700">{formatBaht(sumExVat)} บาท</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">ไม่มี VAT</p>
          <p className="mt-1 text-xl font-bold text-gray-700">{formatBaht(sumNoVat)} บาท</p>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-brand-200 bg-brand-50 p-4">
        <p className="text-xs font-medium text-brand-700">
          ยอดคาดว่าจะได้เงินคืนรวม (ฐานไม่รวม VAT) — ยอดที่กรอกแบบรวม VAT ถูกถอด VAT 7% ออกให้แล้ว (÷1.07) บวกยอดไม่รวม VAT และยอดไม่มี VAT
        </p>
        <p className="mt-1 text-2xl font-bold text-brand-700">{formatBaht(refundExVat)} บาท</p>
        {sumUnspecified > 0 && (
          <p className="mt-1 text-xs text-amber-600">
            ยังไม่รวมอีก {formatBaht(sumUnspecified)} บาท ที่ยังไม่ได้ระบุ VAT — ไปติ๊กช่อง VAT ในตารางให้ครบ ตัวเลขนี้จะคำนวณเพิ่มให้เอง
          </p>
        )}
      </div>

      <AddHeldDepositForm />

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2">มัดจำที่ไหน / เรื่องอะไร</th>
              <th className="px-4 py-2 text-right">จำนวนเงิน</th>
              <th className="px-4 py-2">VAT</th>
              <th className="px-4 py-2">
                <Link
                  href={`/held-deposits?sort=deposited&dir=${nextDir}`}
                  className="inline-flex items-center gap-1 hover:text-brand-600 hover:underline"
                >
                  วันที่มัดจำ
                  {sortByDeposited ? (dir === "desc" ? " ↓" : " ↑") : " ↕"}
                </Link>
              </th>
              <th className="px-4 py-2">สถานะ</th>
              <th className="px-4 py-2">หมายเหตุ</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {deposits.map((d) => (
              <tr key={d.id} className={`border-t border-gray-100 ${isStillHeld(d) ? "" : "bg-emerald-50/40"}`}>
                <td className={`px-4 py-2 font-medium ${isStillHeld(d) ? "text-gray-800" : "text-gray-400"}`}>{d.location}</td>
                <td className={`px-4 py-2 text-right font-medium ${isStillHeld(d) ? "text-gray-800" : "text-gray-400 line-through"}`}>{formatBaht(d.amount)}</td>
                <td className="px-4 py-2">
                  <HeldDepositVatSelect id={d.id} vatType={d.vatType} />
                </td>
                <td className="px-4 py-2 text-gray-500">
                  <EditDepositDateCell id={d.id} depositedAt={d.depositedAt} />
                </td>
                <td className="px-4 py-2">
                  <HeldDepositStatusBadge id={d.id} status={d.status} />
                </td>
                <td className="px-4 py-2 text-gray-500">{d.note ?? "-"}</td>
                <td className="px-4 py-2">
                  <DeleteHeldDepositButton id={d.id} />
                </td>
              </tr>
            ))}
            {deposits.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-gray-400" colSpan={7}>
                  ยังไม่มีรายการเงินมัดจำ
                </td>
              </tr>
            )}
          </tbody>
          {deposits.length > 0 && (
            <tfoot className="border-t-2 border-gray-200 bg-gray-50 text-sm">
              <tr>
                <td className="px-4 py-2 text-emerald-700">ยอดที่กรอกแบบรวม VAT</td>
                <td className="px-4 py-2 text-right font-semibold text-emerald-700">{formatBaht(sumIncVat)}</td>
                <td className="px-4 py-2" colSpan={5}></td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-sky-700">ยอดที่กรอกแบบไม่รวม VAT</td>
                <td className="px-4 py-2 text-right font-semibold text-sky-700">{formatBaht(sumExVat)}</td>
                <td className="px-4 py-2" colSpan={5}></td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-gray-600">ยอดที่ไม่มี VAT</td>
                <td className="px-4 py-2 text-right font-semibold text-gray-700">{formatBaht(sumNoVat)}</td>
                <td className="px-4 py-2" colSpan={5}></td>
              </tr>
              {sumUnspecified > 0 && (
                <tr>
                  <td className="px-4 py-2 text-amber-600">ยังไม่ระบุ VAT</td>
                  <td className="px-4 py-2 text-right font-semibold text-amber-600">{formatBaht(sumUnspecified)}</td>
                  <td className="px-4 py-2" colSpan={5}></td>
                </tr>
              )}
              <tr className="border-t border-gray-200 font-bold">
                <td className="px-4 py-2 text-gray-800">รวมทั้งหมด</td>
                <td className="px-4 py-2 text-right text-brand-700">{formatBaht(total)}</td>
                <td className="px-4 py-2" colSpan={5}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
