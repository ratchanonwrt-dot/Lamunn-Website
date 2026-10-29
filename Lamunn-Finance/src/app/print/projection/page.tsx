import Link from "next/link";
import { requireSectionPage } from "@/lib/permissions";
import { getAllSettings } from "@/lib/settings";
import { loadProjectionReport } from "@/lib/accounting/projection";
import { fmtSatang } from "@/lib/accounting/money";
import PrintButton from "@/components/accounting/PrintButton";
import ProjectionTable from "@/components/accounting/ProjectionTable";

export const dynamic = "force-dynamic";

function reportYear(value?: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2200 ? parsed : new Date().getUTCFullYear();
}

export default async function ProjectionPrintPage({ searchParams }: { searchParams: { year?: string } }) {
  await requireSectionPage("ACCOUNTING");
  const year = reportYear(searchParams.year);
  const [settings, report] = await Promise.all([getAllSettings(), loadProjectionReport(year)]);

  return (
    <div>
      <style>{`
        @page { size: A3 landscape; margin: 9mm; }
        @media print {
          html, body { background: white !important; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
        }
      `}</style>

      <div className="mx-auto mb-4 flex max-w-[420mm] items-center justify-between gap-3 print:hidden">
        <Link href={`/accounting/projection?year=${year}`} className="text-sm text-gray-500 hover:text-brand-700 hover:underline">
          ← กลับไปหน้าประมาณการ
        </Link>
        <PrintButton label="พิมพ์ / บันทึก PDF" />
      </div>

      <main className="mx-auto min-h-[277mm] w-full max-w-[420mm] bg-white px-7 py-6 text-black shadow-sm print:min-h-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="mb-5 text-center">
          <h1 className="text-xl font-bold">{settings.companyName || "ชื่อบริษัท"}</h1>
          <h2 className="mt-1 text-lg font-bold">ประมาณการเปรียบเทียบผลที่เกิดขึ้นจริง</h2>
          <p className="mt-1 text-sm">สำหรับรอบระยะเวลาบัญชี ปี {year + 543} ({year})</p>
          <p className="mt-0.5 text-[10px] text-gray-500">หน่วย: บาท</p>
        </header>

        <ProjectionTable report={report} />

        <section className="mt-5 grid grid-cols-5 gap-2 text-[9px]">
          {report.losses.map((loss) => (
            <div key={loss.lossYear} className="border border-gray-300 px-2 py-1.5">
              <span className="text-gray-500">ขาดทุนยกมาปี {loss.lossYear + 543}</span>
              <p className="mt-0.5 text-right font-semibold">{fmtSatang(loss.amount, { zeroDash: false })}</p>
            </div>
          ))}
        </section>
        <p className="mt-2 text-[8px] text-gray-500">
          ผลจริงมาจากใบสำคัญที่ผ่านรายการแล้วในงบกำไรขาดทุน ขาดทุนสุทธิยกมาเป็นยอดทางภาษีที่ผู้ใช้ยืนยันและระบบจำกัดเฉพาะ 5 ปีก่อนรอบบัญชีปัจจุบัน
        </p>
      </main>
    </div>
  );
}
