import { prisma } from "@lamunn/db-finance";
import type { AccWhtFormType } from "@lamunn/db-finance";
import { monthRange } from "@/lib/dates";
import { thaiMonthLabel } from "@/lib/format";
import { getAllSettings } from "@/lib/settings";
import MonthFilterBar from "@/components/MonthFilterBar";
import TaxReportTabs from "@/components/accounting/TaxReportTabs";
import StatementShell from "@/components/accounting/StatementShell";
import WhtCertificateForm from "@/components/accounting/WhtCertificateForm";
import VoidDocButton from "@/components/accounting/VoidDocButton";
import { buildWhtReport } from "@/lib/accounting/taxReports";
import { WHT_FORM_LABELS, WHT_FORM_SHORT } from "@/lib/accounting/whtTypes";
import Link from "next/link";
import { fmtSatang } from "@/lib/accounting/money";

/** หน้ารายงาน ภ.ง.ด.3 และ ภ.ง.ด.53 ใช้โครงเดียวกันทั้งหมด ต่างแค่แบบที่กรอง
 * แยกเป็นคอมโพเนนต์กลางเพื่อไม่ให้ต้องดูแลโค้ดซ้ำสองชุด */
export default async function WhtReportView({
  formType,
  basePath,
  canEdit,
  searchParams,
}: {
  formType: AccWhtFormType;
  basePath: string;
  canEdit: boolean;
  searchParams: { year?: string; month?: string };
}) {
  const now = new Date();
  const year = Number(searchParams.year) || now.getUTCFullYear();
  const month = Number(searchParams.month) || now.getUTCMonth() + 1;
  const { start, end } = monthRange(year, month - 1);

  const [settings, report, partners, expenseAccounts, creditAccounts] = await Promise.all([
    getAllSettings(),
    buildWhtReport(start, end, formType),
    prisma.accPartner.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, phone: true, taxId: true, branchTag: true, address: true },
    }),
    // บัญชีสำหรับสร้างใบสำคัญให้อัตโนมัติ — เดบิตเป็นค่าใช้จ่าย/สินทรัพย์ เครดิตเป็นเงิน/เจ้าหนี้
    prisma.accAccount.findMany({
      where: { isActive: true, isPostable: true, type: { in: ["EXPENSE", "ASSET"] }, vatRole: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true, nameTh: true },
    }),
    prisma.accAccount.findMany({
      where: { isActive: true, isPostable: true, type: { in: ["ASSET", "LIABILITY"] }, vatRole: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true, nameTh: true },
    }),
  ]);

  const short = WHT_FORM_SHORT[formType];
  // ภ.ง.ด.3 / ภ.ง.ด.53 ยื่นภายในวันที่ 7 ของเดือนถัดไป (ยื่นออนไลน์ได้ขยายเวลาเพิ่ม)
  const dueMonth = new Date(Date.UTC(year, month, 7));
  const diff = report.totalWht - report.glWhtPayable;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-bold text-gray-900">{WHT_FORM_LABELS[formType]}</h1>
          <p className="text-sm text-gray-500">
            สรุปภาษีหัก ณ ที่จ่ายของเดือน — กำหนดยื่นภายในวันที่ 7 {thaiMonthLabel(dueMonth.getUTCFullYear(), dueMonth.getUTCMonth())}
          </p>
        </div>
        {canEdit && (
          <WhtCertificateForm
            partners={partners}
            defaultFormType={formType === "PND3" ? "PND3" : "PND53"}
            expenseAccounts={expenseAccounts}
            creditAccounts={creditAccounts}
          />
        )}
      </div>

      <TaxReportTabs />
      <MonthFilterBar basePath={basePath} year={year} month={month} />

      {(report.rows.length > 0 || report.journalRows.length > 0) && diff !== 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠ ยอดหัก ณ ที่จ่ายตามเอกสาร {fmtSatang(report.totalWht, { zeroDash: false })} ไม่ตรงกับยอดในบัญชี
          &ldquo;ภาษีหัก ณ ที่จ่ายค้างนำส่ง&rdquo; {fmtSatang(report.glWhtPayable, { zeroDash: false })} — ต่างกัน{" "}
          {fmtSatang(Math.abs(diff), { zeroDash: false })}
          <span className="mt-1 block text-xs">
            ยอดในบัญชีรวมทั้ง ภ.ง.ด.3 และ ภ.ง.ด.53 เข้าด้วยกัน ถ้าเดือนนี้มีทั้งสองแบบ ตัวเลขจะต่างกันเป็นปกติ —
            ให้เทียบผลรวมของทั้งสองหน้ากับบัญชีแทน
          </span>
        </div>
      )}

      {report.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-gray-700">
            เดือน {thaiMonthLabel(year, month - 1)} ยังไม่มีรายการหัก ณ ที่จ่ายสำหรับ{short}
          </p>
          {canEdit && <p className="mt-1 text-sm text-gray-500">กด &ldquo;บันทึกการหัก ณ ที่จ่าย&rdquo; ด้านบนเพื่อเริ่มบันทึก</p>}
        </div>
      ) : (
        <StatementShell
          companyName={settings.companyName}
          title={`${short} — ภาษีเงินได้หัก ณ ที่จ่าย`}
          subtitle={`สำหรับเดือน ${thaiMonthLabel(year, month - 1)} · ผู้รับเงิน ${report.payeeCount} ราย`}
        >
          <table className="w-full min-w-[58rem] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400">
                <th className="w-12 py-2 pr-2 text-right font-medium">ลำดับ</th>
                <th className="py-2 px-2 text-left font-medium">วันที่จ่าย</th>
                <th className="py-2 px-2 text-left font-medium">เลขที่หนังสือรับรอง</th>
                <th className="py-2 px-2 text-left font-medium">ผู้รับเงิน</th>
                <th className="py-2 px-2 text-left font-medium">เลขผู้เสียภาษี</th>
                <th className="py-2 px-2 text-left font-medium">ประเภทเงินได้</th>
                <th className="py-2 px-2 text-right font-medium">จำนวนเงินที่จ่าย</th>
                <th className="py-2 px-2 text-right font-medium">อัตรา</th>
                <th className="py-2 pl-2 text-right font-medium">ภาษีที่หัก</th>
                {canEdit && <th className="py-2 pl-2 print:hidden" />}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {report.rows.map((r, i) => (
                <tr key={r.id} className="border-b border-gray-50">
                  <td className="py-1.5 pr-2 text-right text-xs text-gray-400">{i + 1}</td>
                  <td className="py-1.5 px-2 font-mono text-xs text-gray-500">{r.payDate.toISOString().slice(0, 10)}</td>
                  <td className="py-1.5 px-2 font-mono text-xs">
                    <Link
                      href={`/print/wht/${r.id}`}
                      target="_blank"
                      className="text-brand-700 hover:underline"
                      title="เปิดหนังสือรับรอง 50 ทวิ"
                    >
                      {r.docNo}
                      <span className="ml-1 font-sans text-[10px] text-gray-400">พิมพ์ 50 ทวิ</span>
                    </Link>
                  </td>
                  <td className="py-1.5 px-2 text-gray-800">
                    {r.payeeName}
                    {r.payeeBranchTag && <span className="ml-1.5 text-xs text-gray-400">({r.payeeBranchTag})</span>}
                  </td>
                  <td className="py-1.5 px-2 font-mono text-xs text-gray-500">{r.payeeTaxId ?? "-"}</td>
                  <td className="py-1.5 px-2 text-xs text-gray-600">{r.incomeType}</td>
                  <td className="py-1.5 px-2 text-right">{fmtSatang(r.base)}</td>
                  <td className="py-1.5 px-2 text-right text-gray-500">{(r.rate * 100).toFixed(2)}%</td>
                  <td className="py-1.5 pl-2 text-right font-medium">{fmtSatang(r.wht)}</td>
                  {canEdit && (
                    <td className="py-1.5 pl-2 text-right print:hidden">
                      <VoidDocButton endpoint="/api/accounting/wht" id={r.id} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-800 font-bold tabular-nums">
                <td colSpan={6} className="py-2 pr-2">
                  รวม {report.rows.length} รายการ · ผู้รับเงิน {report.payeeCount} ราย
                </td>
                <td className="py-2 px-2 text-right">{fmtSatang(report.totalBase, { zeroDash: false })}</td>
                <td />
                <td className="py-2 pl-2 text-right">{fmtSatang(report.totalWht, { zeroDash: false })}</td>
                {canEdit && <td className="print:hidden" />}
              </tr>
            </tfoot>
          </table>
        </StatementShell>
      )}

      {report.journalRows.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="mb-1 font-semibold">
              มีรายการหัก ณ ที่จ่ายในสมุดรายวัน {report.journalRows.length} รายการ รวม{" "}
              {fmtSatang(report.journalTotal, { zeroDash: false })} บาท ที่ยังไม่ได้ออกหนังสือรับรอง
            </p>
            <p className="text-xs">
              รายการพวกนี้ <b>ยังไม่ถูกนับในยอดของแบบด้านบน</b> เพราะจากใบสำคัญอย่างเดียวระบบไม่รู้แน่ชัดว่า
              ผู้รับเงินเป็นบุคคลธรรมดา (ภ.ง.ด.3) หรือนิติบุคคล (ภ.ง.ด.53) — ถ้าเดาผิดคือยื่นผิดแบบ
              ให้กด &ldquo;บันทึกการหัก ณ ที่จ่าย&rdquo; ด้านบนเพื่อออกหนังสือรับรองให้ตรงกับใบสำคัญ แล้วยอดจะเข้าแบบเอง
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-400">
                  <th className="py-2.5 pl-4 pr-3 text-left font-medium">วันที่</th>
                  <th className="py-2.5 px-3 text-left font-medium">เลขที่ใบสำคัญ</th>
                  <th className="py-2.5 px-3 text-left font-medium">รายการ / ผู้รับเงิน</th>
                  <th className="py-2.5 px-3 text-left font-medium">เลขผู้เสียภาษี</th>
                  <th className="py-2.5 px-3 text-left font-medium">แบบที่คาดว่าใช่</th>
                  <th className="py-2.5 px-3 text-right font-medium">ฐานภาษี</th>
                  <th className="py-2.5 pr-4 text-right font-medium">ภาษีที่หัก</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {report.journalRows.map((r) => (
                  <tr key={r.entryId} className="border-b border-gray-50">
                    <td className="py-2 pl-4 pr-3 font-mono text-xs text-gray-500">{r.date.toISOString().slice(0, 10)}</td>
                    <td className="py-2 px-3">
                      <Link
                        href={`/accounting/journal?year=${year}&month=${month}`}
                        className="font-mono text-xs text-gray-600 hover:text-brand-700 hover:underline"
                      >
                        {r.entryNo}
                      </Link>
                    </td>
                    <td className="py-2 px-3 text-gray-800">
                      {r.partnerName ?? r.description}
                      {r.partnerName && <span className="ml-1.5 text-xs text-gray-400">{r.description}</span>}
                    </td>
                    <td className="py-2 px-3 font-mono text-xs text-gray-500">{r.partnerTaxId ?? "-"}</td>
                    <td className="py-2 px-3">
                      {r.suggestedForm ? (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                          {WHT_FORM_SHORT[r.suggestedForm]}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">ไม่มีเลขผู้เสียภาษี</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-600">{fmtSatang(r.base)}</td>
                    <td className="py-2 pr-4 text-right font-medium">{fmtSatang(r.vat)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-300 font-semibold tabular-nums">
                  <td colSpan={6} className="py-2 pr-3 text-right">
                    รวม
                  </td>
                  <td className="py-2 pr-4 text-right">{fmtSatang(report.journalTotal, { zeroDash: false })}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            &ldquo;แบบที่คาดว่าใช่&rdquo; เดาจากเลขประจำตัวผู้เสียภาษี 13 หลัก (ขึ้นต้นด้วย 0 = นิติบุคคล) เป็นตัวช่วยกรอกเท่านั้น
            ไม่ใช่ข้อสรุป
          </p>
        </div>
      )}

      <p className="mt-3 text-xs text-gray-400">
        อัตราภาษีที่ระบบเติมให้เป็นค่าตั้งต้นที่ใช้กันทั่วไป — อัตราจริงขึ้นกับประเภทผู้รับเงินและเงื่อนไขเฉพาะราย
        แก้ไขได้ในฟอร์มเสมอ และควรให้ผู้ทำบัญชียืนยันก่อนยื่น
      </p>
    </div>
  );
}
