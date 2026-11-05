import { prisma } from "@lamunn/db-finance";
import { getBranchOptions } from "@/lib/accounting/refData";
import { requireSectionPage } from "@/lib/permissions";
import { monthRange } from "@/lib/dates";
import { thaiMonthLabel } from "@/lib/format";
import MonthFilterBar from "@/components/MonthFilterBar";
import TaxInvoiceForm from "@/components/accounting/TaxInvoiceForm";
import TaxInvoiceActions from "@/components/accounting/TaxInvoiceActions";
import { CHANNEL_LABELS } from "@/lib/accounting/channels";
import { fmtSatang, toSatang } from "@/lib/accounting/money";
import { formatPartnerDisplayName } from "@/lib/accounting/partnerDisplay";
import { formatAccountingDate } from "@/lib/accounting/dateFormat";

export const dynamic = "force-dynamic";

export default async function TaxInvoicesPage({ searchParams }: { searchParams: { year?: string; month?: string } }) {
  const { permissions } = await requireSectionPage("ACCOUNTING");
  const canEdit = permissions.ACCOUNTING.canEdit;

  const now = new Date();
  const year = Number(searchParams.year) || now.getUTCFullYear();
  const month = Number(searchParams.month) || now.getUTCMonth() + 1;
  const { start, end } = monthRange(year, month - 1);

  const [invoices, branches] = await Promise.all([
    prisma.accTaxInvoice.findMany({
      where: { issueDate: { gte: start, lte: end } },
      orderBy: { docNo: "asc" },
      include: { branch: { select: { name: true } } },
    }),
    getBranchOptions(),
  ]);

  // ใบที่ขายนอกยอดรวมต้องมีใบสำคัญของตัวเอง — เช็คว่าลงบัญชีไปแล้วหรือยัง
  const standalone = invoices.filter((i) => !i.deductFromBulk && !i.voided);
  const postedKeys = new Set(
    (
      await prisma.accJournalEntry.findMany({
        where: { sourceType: "TAX_INVOICE", sourceKey: { in: standalone.map((i) => i.id) } },
        select: { sourceKey: true },
      })
    ).map((e) => e.sourceKey ?? "")
  );

  const live = invoices.filter((i) => !i.voided);
  const totalBase = live.reduce((s, i) => s + toSatang(i.baseAmount), 0);
  const totalVat = live.reduce((s, i) => s + toSatang(i.vatAmount), 0);
  const totalAll = live.reduce((s, i) => s + toSatang(i.totalAmount), 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-bold text-gray-900">ใบกำกับภาษีเต็มรูป</h1>
          <p className="text-sm text-gray-500">
            ใบที่ออกให้ลูกค้าที่มาขอเป็นราย ๆ — เลขที่รันต่อเนื่องอัตโนมัติ ห้ามข้ามตามข้อกำหนดสรรพากร
          </p>
        </div>
        {canEdit && <TaxInvoiceForm branches={branches} />}
      </div>

      <MonthFilterBar basePath="/accounting/tax-invoices" year={year} month={month} />

      {live.length > 0 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <SummaryCard label="มูลค่าก่อน VAT" value={fmtSatang(totalBase, { zeroDash: false })} />
          <SummaryCard label="ภาษีขาย" value={fmtSatang(totalVat, { zeroDash: false })} />
          <SummaryCard label={`รวม ${live.length} ใบ`} value={fmtSatang(totalAll, { zeroDash: false })} strong />
        </div>
      )}

      {invoices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500">
          ยังไม่มีใบกำกับภาษีเต็มรูปในเดือน {thaiMonthLabel(year, month - 1)}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[62rem] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-400">
                <th className="py-2.5 pl-4 pr-3 text-left font-medium">เลขที่</th>
                <th className="py-2.5 px-3 text-left font-medium">วันที่ออก</th>
                <th className="py-2.5 px-3 text-left font-medium">วันที่ขาย</th>
                <th className="py-2.5 px-3 text-left font-medium">ลูกค้า</th>
                <th className="py-2.5 px-3 text-left font-medium">เลขผู้เสียภาษี</th>
                <th className="py-2.5 px-3 text-right font-medium">ก่อน VAT</th>
                <th className="py-2.5 px-3 text-right font-medium">VAT</th>
                <th className="py-2.5 px-3 text-right font-medium">รวม</th>
                <th className="py-2.5 px-3 text-left font-medium">ที่มาของยอด</th>
                {canEdit && <th className="py-2.5 pr-4" />}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {invoices.map((inv) => (
                <tr key={inv.id} className={`border-b border-gray-50 ${inv.voided ? "opacity-40" : ""}`}>
                  <td className="py-2 pl-4 pr-3 font-mono text-xs text-gray-700">{inv.docNo}</td>
                  <td className="py-2 px-3 font-mono text-xs text-gray-500">{formatAccountingDate(inv.issueDate)}</td>
                  <td className="py-2 px-3 font-mono text-xs text-gray-500">{formatAccountingDate(inv.saleDate)}</td>
                  <td className="py-2 px-3 text-gray-800">
                    {formatPartnerDisplayName(inv.customerName, inv.branchTag)}
                    {inv.receiptNo && <span className="ml-1.5 text-xs text-gray-400">บิล {inv.receiptNo}</span>}
                    {inv.branch && <span className="ml-1.5 text-xs text-gray-400">· {inv.branch.name}</span>}
                  </td>
                  <td className="py-2 px-3 font-mono text-xs text-gray-500">{inv.taxId ?? "-"}</td>
                  <td className="py-2 px-3 text-right text-gray-600">{fmtSatang(toSatang(inv.baseAmount))}</td>
                  <td className="py-2 px-3 text-right text-gray-600">{fmtSatang(toSatang(inv.vatAmount))}</td>
                  <td className="py-2 px-3 text-right font-medium text-gray-900">{fmtSatang(toSatang(inv.totalAmount))}</td>
                  <td className="py-2 px-3">
                    {inv.deductFromBulk ? (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                        อยู่ในยอดขายรวม · {CHANNEL_LABELS[inv.channel] ?? inv.channel}
                      </span>
                    ) : postedKeys.has(inv.id) ? (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">ขายนอกยอดรวม · ลงบัญชีแล้ว</span>
                    ) : (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">ขายนอกยอดรวม · ยังไม่ลงบัญชี</span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="py-2 pr-4">
                      <TaxInvoiceActions
                        invoiceId={inv.id}
                        voided={inv.voided}
                        needsPosting={!inv.deductFromBulk}
                        posted={postedKeys.has(inv.id)}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-gray-400">
        ใบที่ระบุว่า &ldquo;อยู่ในยอดขายรวม&rdquo; จะไม่มีรายการบัญชีของตัวเอง เพราะรายได้ถูกบันทึกไปแล้วพร้อมใบสำคัญขายประจำวัน —
        นี่คือกลไกที่ทำให้ยอดไม่ตีกัน
      </p>
    </div>
  );
}

function SummaryCard({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`mt-0.5 tabular-nums ${strong ? "text-lg font-bold text-gray-900" : "text-lg font-semibold text-gray-700"}`}>{value}</p>
    </div>
  );
}
