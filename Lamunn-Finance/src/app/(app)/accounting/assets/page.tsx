import Link from "next/link";
import { prisma } from "@lamunn/db-finance";
import { requireSectionPage } from "@/lib/permissions";
import AccountList from "@/components/accounting/AccountList";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const { permissions } = await requireSectionPage("ACCOUNTING");
  const canEdit = permissions.ACCOUNTING.canEdit;

  const accounts = await prisma.accAccount.findMany({
    where: { type: "ASSET" },
    orderBy: { code: "asc" },
  });
  const usage = accounts.length
    ? await prisma.accJournalLine.groupBy({
        by: ["accountId"],
        where: { accountId: { in: accounts.map((account) => account.id) } },
        _count: { _all: true },
      })
    : [];
  const groups = accounts.filter((account) => !account.isPostable).map((account) => ({ code: account.code, nameTh: account.nameTh }));
  const usedCount = new Map(usage.map((item) => [item.accountId, item._count._all]));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-bold text-gray-900">สินทรัพย์</h1>
          <p className="text-sm text-gray-500">
            บัญชีหมวดสินทรัพย์จากผังบัญชี ใช้ตรวจรหัส ชื่อบัญชี และสถานะการใช้งานโดยไม่สร้างรายการบัญชีใหม่
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/accounting/balance-sheet" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-medium text-emerald-700 hover:bg-emerald-100">
            ดูงบแสดงฐานะการเงิน
          </Link>
          <Link href="/accounting/accounts" className="rounded-lg border border-gray-200 bg-white px-3 py-2 font-medium text-gray-600 hover:bg-gray-50">
            เปิดผังบัญชีทั้งหมด
          </Link>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-gray-700">ยังไม่มีบัญชีหมวดสินทรัพย์</p>
          <p className="mt-1 text-sm text-gray-500">เพิ่มบัญชีประเภทสินทรัพย์จากหน้าผังบัญชีก่อน แล้วรายการจะปรากฏที่หน้านี้อัตโนมัติ</p>
        </div>
      ) : (
        <AccountList
          canEdit={canEdit}
          groups={groups}
          accounts={accounts.map((account) => ({
            id: account.id,
            code: account.code,
            nameTh: account.nameTh,
            type: account.type,
            parentCode: account.parentCode,
            isPostable: account.isPostable,
            isActive: account.isActive,
            vatRole: account.vatRole,
            usedCount: usedCount.get(account.id) ?? 0,
          }))}
        />
      )}
    </div>
  );
}
