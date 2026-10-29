import { requireSectionPage } from "@/lib/permissions";
import { loadProjectionReport } from "@/lib/accounting/projection";
import ProjectionWorkspace from "@/components/accounting/ProjectionWorkspace";

export const dynamic = "force-dynamic";

function reportPeriod(searchParams: { year?: string; month?: string }) {
  const now = new Date();
  const year = Number(searchParams.year);
  const month = Number(searchParams.month);
  return {
    year: Number.isInteger(year) && year >= 2000 && year <= 2200 ? year : now.getUTCFullYear(),
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : now.getUTCMonth() + 1,
  };
}

export default async function ProjectionPage({ searchParams }: { searchParams: { year?: string; month?: string } }) {
  await requireSectionPage("ACCOUNTING");
  const { year, month } = reportPeriod(searchParams);
  const report = await loadProjectionReport(year);

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-gray-900">ประมาณการ</h1>
      <p className="mb-5 text-sm text-gray-500">
        เปรียบเทียบรายได้ ค่าใช้จ่าย และผลคงเหลือที่ประมาณการกับยอดจริงจากงบกำไรขาดทุนครบ 12 เดือน
      </p>
      <ProjectionWorkspace initialReport={report} selectedMonth={month} />
    </div>
  );
}
