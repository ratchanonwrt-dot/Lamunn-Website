import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@lamunn/db-finance";
import { requireSectionPage } from "@/lib/permissions";
import { formatThaiDate } from "@/lib/format";
import { getAllSettings } from "@/lib/settings";
import { fmtSatang, toSatang } from "@/lib/accounting/money";
import { bahtTextFromSatang } from "@/lib/accounting/bahtText";
import PrintButton from "@/components/accounting/PrintButton";
import { formatPartnerDisplayName } from "@/lib/accounting/partnerDisplay";

export const dynamic = "force-dynamic";

/** ชื่อเอกสารตามประเภทสมุดรายวัน — ใบสำคัญจ่าย/รับ/ทั่วไป ใช้ฟอร์มเดียวกันหมด ต่างแค่หัวเรื่อง */
const DOC_TITLES: Record<string, { th: string; en: string }> = {
  PAYMENT: { th: "ใบสำคัญจ่าย", en: "Payment Voucher" },
  RECEIPT: { th: "ใบสำคัญรับ", en: "Receipt Voucher" },
  SALES: { th: "ใบสำคัญขาย", en: "Sales Voucher" },
  PURCHASE: { th: "ใบสำคัญซื้อ", en: "Purchase Voucher" },
  ADJUST: { th: "ใบสำคัญปรับปรุง", en: "Adjusting Voucher" },
  CLOSING: { th: "ใบสำคัญปิดบัญชี", en: "Closing Voucher" },
  GENERAL: { th: "ใบสำคัญทั่วไป", en: "Journal Voucher" },
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "ร่าง — ยังไม่ผ่านรายการ",
  POSTED: "ผ่านรายการแล้ว",
  VOID: "ยกเลิกแล้ว",
};

export default async function JournalPrintPage({ params }: { params: { id: string } }) {
  await requireSectionPage("ACCOUNTING");

  const [settings, entry] = await Promise.all([
    getAllSettings(),
    prisma.accJournalEntry.findUnique({
      where: { id: params.id },
      include: {
        lines: {
          orderBy: { sortOrder: "asc" },
          include: {
            account: { select: { code: true, nameTh: true } },
            partner: { select: { name: true, taxId: true, address: true, branchTag: true } },
            branch: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  if (!entry) notFound();

  const title = DOC_TITLES[entry.journalType] ?? DOC_TITLES.GENERAL;
  const totalDebit = entry.lines.reduce((s, l) => s + toSatang(l.debit), 0);
  const totalCredit = entry.lines.reduce((s, l) => s + toSatang(l.credit), 0);
  // คู่ค้ารายแรกที่ระบุในใบสำคัญ = ผู้รับเงิน/ผู้จ่ายเงินของเอกสารใบนี้
  const partner = entry.lines.find((l) => l.partner)?.partner ?? null;

  return (
    <div>
      {/* แถบเครื่องมือ — ไม่ติดไปกับกระดาษที่พิมพ์ */}
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/accounting/journal" className="text-sm text-gray-500 hover:text-brand-700 hover:underline">
          ← กลับไปสมุดรายวัน
        </Link>
        <PrintButton />
      </div>

      {entry.status !== "POSTED" && (
        <div className="mx-auto mb-4 max-w-[210mm] rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 print:hidden">
          ใบสำคัญนี้อยู่ในสถานะ &ldquo;{STATUS_LABEL[entry.status]}&rdquo; — พิมพ์ออกมาดูได้ แต่ยอดยังไม่เข้างบการเงิน
        </div>
      )}

      <div className="mx-auto max-w-[210mm] rounded-xl border border-gray-200 bg-white p-8 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        {/* หัวเอกสาร */}
        <div className="flex items-start justify-between gap-6 border-b-2 border-gray-800 pb-4">
          <div className="min-w-0">
            <p className="text-base font-bold text-gray-900">{settings.companyName || "(ยังไม่ได้ตั้งชื่อบริษัทในหน้าตั้งค่าระบบ)"}</p>
            {settings.companyAddress && <p className="mt-0.5 text-xs leading-relaxed text-gray-600">{settings.companyAddress}</p>}
            {settings.companyTaxId && <p className="text-xs text-gray-600">เลขประจำตัวผู้เสียภาษี {settings.companyTaxId}</p>}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-bold text-gray-900">{title.th}</p>
            <p className="text-xs text-gray-500">{title.en}</p>
            {entry.status === "VOID" && <p className="mt-1 text-sm font-bold text-rose-600">** ยกเลิก **</p>}
          </div>
        </div>

        {/* ข้อมูลหัวใบ */}
        <div className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <Field label="เลขที่" value={entry.entryNo} mono />
          <Field label="วันที่" value={formatThaiDate(entry.date)} />
          <Field label={entry.journalType === "RECEIPT" ? "รับจาก" : "จ่ายให้"} value={partner ? formatPartnerDisplayName(partner.name, partner.branchTag) : "-"} />
          <Field label="เลขประจำตัวผู้เสียภาษี" value={partner?.taxId ?? "-"} mono />
          <div className="sm:col-span-2">
            <Field label="รายการ" value={entry.description} />
          </div>
          {partner?.address && (
            <div className="sm:col-span-2">
              <Field label="ที่อยู่" value={partner.address} />
            </div>
          )}
        </div>

        {/* ตารางรายการบัญชี */}
        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="border-y border-gray-400 text-xs text-gray-600">
              <th className="w-24 py-2 pr-2 text-left font-semibold">รหัสบัญชี</th>
              <th className="py-2 px-2 text-left font-semibold">ชื่อบัญชี</th>
              <th className="py-2 px-2 text-left font-semibold">คำอธิบาย</th>
              <th className="w-32 py-2 px-2 text-right font-semibold">เดบิต</th>
              <th className="w-32 py-2 pl-2 text-right font-semibold">เครดิต</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {entry.lines.map((l) => (
              <tr key={l.id} className="border-b border-gray-100 align-top">
                <td className="py-1.5 pr-2 font-mono text-xs text-gray-600">{l.account.code}</td>
                <td className="py-1.5 px-2 text-gray-800">{l.account.nameTh}</td>
                <td className="py-1.5 px-2 text-xs text-gray-600">
                  {l.memo ?? ""}
                  {l.partner && <span className="ml-1.5 text-gray-400">{formatPartnerDisplayName(l.partner.name, l.partner.branchTag)}</span>}
                  {l.branch && <span className="ml-1.5 text-gray-400">· {l.branch.name}</span>}
                </td>
                <td className="py-1.5 px-2 text-right">{fmtSatang(toSatang(l.debit))}</td>
                <td className="py-1.5 pl-2 text-right">{fmtSatang(toSatang(l.credit))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-y-2 border-gray-800 font-bold tabular-nums">
              <td colSpan={3} className="py-2 pr-2 text-right">
                รวม
              </td>
              <td className="py-2 px-2 text-right">{fmtSatang(totalDebit, { zeroDash: false })}</td>
              <td className="py-2 pl-2 text-right">{fmtSatang(totalCredit, { zeroDash: false })}</td>
            </tr>
          </tfoot>
        </table>

        {/* จำนวนเงินเป็นตัวอักษร — เอกสารบัญชีไทยต้องมีบรรทัดนี้กำกับเสมอ */}
        <div className="mt-3 flex items-baseline gap-2 rounded border border-gray-300 px-3 py-2 text-sm">
          <span className="shrink-0 text-gray-500">จำนวนเงินเป็นตัวอักษร</span>
          <span className="font-semibold text-gray-900">({bahtTextFromSatang(totalDebit)})</span>
        </div>

        {totalDebit !== totalCredit && (
          <p className="mt-2 text-sm font-semibold text-rose-600">
            ⚠ เดบิตไม่เท่ากับเครดิต ต่างกัน {fmtSatang(Math.abs(totalDebit - totalCredit), { zeroDash: false })} บาท
          </p>
        )}

        {/* ช่องลงนาม */}
        <div className="mt-10 grid grid-cols-2 gap-8 text-center text-xs text-gray-600 sm:grid-cols-4">
          {["ผู้จัดทำ", "ผู้ตรวจสอบ", "ผู้อนุมัติ", entry.journalType === "RECEIPT" ? "ผู้จ่ายเงิน" : "ผู้รับเงิน"].map((role) => (
            <div key={role}>
              <div className="mb-1 h-12" />
              <div className="border-t border-dotted border-gray-500 pt-1">{role}</div>
              <div className="mt-2 text-gray-400">วันที่ ......../......../........</div>
            </div>
          ))}
        </div>

        <p className="mt-6 text-[10px] text-gray-400">
          พิมพ์จากระบบบัญชี {settings.companyName} · เลขที่ {entry.entryNo} · สถานะ {STATUS_LABEL[entry.status]}
        </p>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className={`font-medium text-gray-900 ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
