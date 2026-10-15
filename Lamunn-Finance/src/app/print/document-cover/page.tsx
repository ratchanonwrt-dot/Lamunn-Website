import Link from "next/link";
import { requireSectionPage } from "@/lib/permissions";
import PrintButton from "@/components/accounting/PrintButton";
import DocumentCoverArtwork from "@/components/accounting/DocumentCoverArtwork";
import { documentCoverPeriod, documentCoverType } from "@/lib/accounting/documentCover";

export const dynamic = "force-dynamic";

export default async function DocumentCoverPrintPage({
  searchParams,
}: {
  searchParams: { companyName?: string; type?: string; year?: string; month?: string };
}) {
  await requireSectionPage("ACCOUNTING");
  const companyName = String(searchParams.companyName ?? "").trim().slice(0, 160) || "ชื่อบริษัท";
  const type = documentCoverType(searchParams.type);
  const { year, month } = documentCoverPeriod(searchParams.year, searchParams.month);
  const backParams = new URLSearchParams({ type: type.value, year: String(year), month: String(month) });

  return (
    <div>
      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        @media print {
          html, body { background: white !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 print:hidden">
        <Link href={`/accounting/document-cover?${backParams.toString()}`} className="text-sm text-gray-500 hover:text-brand-700 hover:underline">
          ← กลับไปแก้หน้าปก
        </Link>
        <PrintButton label="พิมพ์ / บันทึก PDF" />
      </div>

      <main className="mx-auto w-full max-w-[210mm] bg-white p-[10mm] shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <DocumentCoverArtwork
          companyName={companyName}
          documentLabel={type.label}
          documentEnglish={type.english}
          year={year}
          month={month}
        />
      </main>
    </div>
  );
}
