import Link from "next/link";
import { prisma } from "@lamunn/db-finance";
import { requirePageOwner } from "@/lib/requirePageRole";
import { getCashOnHand } from "@/lib/finance";
import { getPerBranchOutstanding } from "@/lib/creditTermCalc";
import { getSettingNumber } from "@/lib/settings";
import { refundableDepositTotal } from "@/lib/heldDepositCalc";
import { formatBaht, formatThaiDate } from "@/lib/format";
import BankBalanceEdit from "@/components/BankBalanceEdit";
import TiktokOutstandingEdit from "@/components/TiktokOutstandingEdit";
import { CompanyStatusProvider, LiveTotal } from "@/components/CompanyStatusLive";
import AddDividendForm from "@/components/AddDividendForm";
import DeleteDividendButton from "@/components/DeleteDividendButton";
import DividendSourceToggle from "@/components/DividendSourceToggle";
import type { DividendSource } from "@/lib/dividendSource";

export default async function CompanyStatusPage() {
  await requirePageOwner();

  const [bankBalance, tiktokOutstanding, cash, perBranchOutstanding, dividends, deposits] = await Promise.all([
    getSettingNumber("companyBankBalance"),
    getSettingNumber("companyTiktokOutstanding"),
    getCashOnHand(),
    getPerBranchOutstanding(),
    prisma.dividendPayment.findMany({ orderBy: { date: "desc" } }),
    prisma.heldDeposit.findMany(),
  ]);

  const creditTermOutstanding = perBranchOutstanding.reduce((a, b) => a + b.totalOutstanding, 0);
  const dividendTotal = dividends.reduce((a, d) => a + d.amount, 0);
  const dividendBy = (src: string | null) => dividends.filter((d) => (d.source ?? null) === src).reduce((a, d) => a + d.amount, 0);
  const dividendCash = dividendBy("CASH");
  const dividendBank = dividendBy("BANK");
  const dividendUnset = dividendBy(null);
  // เงินมัดจำนับเป็นสินทรัพย์ด้วยยอดที่ "จะได้คืนจริง" (ถอด VAT 7% ออกจากยอดที่กรอกแบบรวม VAT)
  // แถวที่ยังไม่ระบุ VAT นับตามหน้าตั๋วไปก่อน ไม่ให้สินทรัพย์หายจนกว่าจะไปติ๊กครบในหน้าเงินมัดจำ
  const { refundExVat, sumUnspecified } = refundableDepositTotal(deposits);
  const depositTotal = refundExVat + sumUnspecified;
  // เงินในบัญชี + Tiktok เป็นค่ากรอกเองที่อยู่ฝั่ง client (CompanyStatusProvider) — ส่วนที่เหลือของยอดรวมส่งไปเป็น base
  // ให้ <LiveTotal> บวกให้ ตัวเลขรวมจึงขยับทันทีที่กดบันทึกโดยไม่ต้องรอหน้า render ใหม่
  const cashflowBase = cash.balance + creditTermOutstanding;
  const totalAssetsBase = cash.balance + creditTermOutstanding + depositTotal + dividendTotal;

  return (
    <CompanyStatusProvider initialBank={bankBalance} initialTiktok={tiktokOutstanding}>
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-full bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-700">🔒 ส่วนตัว — เห็นได้คนเดียว</span>
      </div>
      <h1 className="mb-6 text-xl font-bold text-gray-800">สถานะการเงินบริษัท</h1>

      <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 p-5">
        <p className="text-sm font-medium text-brand-700">สินทรัพย์รวมโดยประมาณ (เงินในบัญชี + เงินสด + Credit Term ค้างรับ + เงินมัดจำ + เงินปันผลที่จ่ายไปแล้ว + เงินค้าง Tiktok)</p>
        <p className="mt-1 text-3xl font-bold text-brand-700"><LiveTotal base={totalAssetsBase} /></p>
      </div>

      <div className="mb-8 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="text-sm font-medium text-emerald-700">Cashflow ในบริษัท (เงินสด + เงินในบัญชี + Credit Term + เงินค้าง Tiktok)</p>
        <p className="mt-1 text-3xl font-bold text-emerald-700"><LiveTotal base={cashflowBase} /></p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs text-gray-500">เงินในบัญชี (กรอกเอง)</p>
          <BankBalanceEdit />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs text-gray-500">เงินสด (ดึงจากระบบ)</p>
          <p className="mt-1 text-2xl font-bold text-gray-800">{formatBaht(cash.balance)} บาท</p>
          <Link href="/cash-status" className="mt-1 inline-block text-xs text-brand-600 hover:underline">
            ดูรายละเอียด →
          </Link>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs text-gray-500">Credit Term ค้างรับ (ดึงจากระบบ)</p>
          <p className="mt-1 text-2xl font-bold text-gray-800">{formatBaht(creditTermOutstanding)} บาท</p>
          <Link href="/credit-term" className="mt-1 inline-block text-xs text-brand-600 hover:underline">
            ดูรายละเอียด →
          </Link>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs text-gray-500">เงินค้าง Tiktok (กรอกเอง)</p>
          <TiktokOutstandingEdit />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs text-gray-500">เงินมัดจำ (ดึงจากระบบ)</p>
          <p className="mt-1 text-2xl font-bold text-gray-800">{formatBaht(depositTotal)} บาท</p>
          <p className="mt-1 text-[11px] text-gray-400">ยอดที่จะได้คืนจริง — ถอด VAT ออกจากยอดที่กรอกแบบรวม VAT แล้ว</p>
          {sumUnspecified > 0 && (
            <p className="mt-0.5 text-[11px] text-amber-600">มี {formatBaht(sumUnspecified)} บาท ยังไม่ระบุ VAT (นับตามหน้าตั๋วไปก่อน)</p>
          )}
          <Link href="/held-deposits" className="mt-1 inline-block text-xs text-brand-600 hover:underline">
            ดูรายละเอียด →
          </Link>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs text-gray-500">เงินจ่ายปันผลแล้วสะสม (กรอกเอง)</p>
          <p className="mt-1 text-2xl font-bold text-gray-800">{formatBaht(dividendTotal)} บาท</p>
          <div className="mt-2 flex flex-col gap-0.5 text-xs">
            <span className="text-amber-700">เงินสด {formatBaht(dividendCash)}</span>
            <span className="text-sky-700">บัญชีบริษัท {formatBaht(dividendBank)}</span>
            {dividendUnset > 0 && <span className="text-gray-400">ยังไม่ระบุ {formatBaht(dividendUnset)}</span>}
          </div>
        </div>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-gray-700">ประวัติเงินปันผลที่จ่ายไป</h2>
      <AddDividendForm />
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2">วันที่</th>
              <th className="px-4 py-2 text-right">จำนวนเงิน</th>
              <th className="px-4 py-2">จ่ายจาก</th>
              <th className="px-4 py-2">หมายเหตุ</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {dividends.map((d) => (
              <tr key={d.id} className="border-t border-gray-100">
                <td className="px-4 py-2">{formatThaiDate(d.date)}</td>
                <td className="px-4 py-2 text-right font-medium text-gray-800">{formatBaht(d.amount)}</td>
                <td className="px-4 py-2">
                  <DividendSourceToggle id={d.id} source={(d.source as DividendSource | null) ?? null} />
                </td>
                <td className="px-4 py-2 text-gray-500">{d.note ?? "-"}</td>
                <td className="px-4 py-2">
                  <DeleteDividendButton id={d.id} />
                </td>
              </tr>
            ))}
            {dividends.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-gray-400" colSpan={5}>
                  ยังไม่มีประวัติการจ่ายปันผล
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    </CompanyStatusProvider>
  );
}
