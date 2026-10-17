import BankReconciliationUpload from "@/components/accounting/BankReconciliationUpload";
import type { ReconciliationStatusFilter } from "@/lib/accounting/bankReconciliation";
import { requireSectionPage } from "@/lib/permissions";

export default async function BankReconciliationPage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string; status?: string };
}) {
  await requireSectionPage("ACCOUNTING");
  const now = new Date();
  const requestedYear = Number(searchParams.year);
  const requestedMonth = Number(searchParams.month);
  const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2200
    ? requestedYear
    : now.getUTCFullYear();
  const month = Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12
    ? requestedMonth
    : now.getUTCMonth() + 1;
  const status: ReconciliationStatusFilter = ["matched", "mismatched", "not-found"].includes(searchParams.status ?? "")
    ? searchParams.status as ReconciliationStatusFilter
    : "all";

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-gray-900">กระทบยอดเงินฝากธนาคาร</h1>
      <p className="mb-5 text-sm text-gray-500">
        เปรียบเทียบรายการเดินบัญชีจากธนาคารกับรายการในบัญชี เพื่อหารายการที่ตรงกัน รายการค้าง และยอดผลต่าง
      </p>
      <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        หน้านี้ใช้ตรวจสอบและกระทบยอดเท่านั้น — จะไม่สร้างใบสำคัญ ไม่แก้สมุดรายวัน และไม่นำรายการไปลงบัญชี
      </div>
      <BankReconciliationUpload year={year} month={month} statusFilter={status} />
    </div>
  );
}
