import { requireSectionPage } from "@/lib/permissions";
import { getAllSettings } from "@/lib/settings";
import DocumentCoverBuilder from "@/components/accounting/DocumentCoverBuilder";
import { documentCoverPeriod, documentCoverType } from "@/lib/accounting/documentCover";

export const dynamic = "force-dynamic";

export default async function DocumentCoverPage({ searchParams }: { searchParams: { type?: string; year?: string; month?: string } }) {
  await requireSectionPage("ACCOUNTING");
  const settings = await getAllSettings();
  const type = documentCoverType(searchParams.type);
  const period = documentCoverPeriod(searchParams.year, searchParams.month);

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">ปกเอกสาร</h1>
        <p className="mt-1 text-sm text-gray-500">จัดทำหน้าปกเอกสารบัญชีรายเดือน แล้วพิมพ์หรือบันทึกเป็น PDF ขนาด A4</p>
      </div>
      <DocumentCoverBuilder
        initialCompanyName={settings.companyName || "บริษัท ละมุน เบเกอรี่ จำกัด"}
        initialType={type.value}
        initialYear={period.year}
        initialMonth={period.month}
      />
    </div>
  );
}
