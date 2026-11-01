import { prisma } from "@lamunn/db-finance";
import { requireSectionPage } from "@/lib/permissions";
import { loadDepreciationSchedule } from "@/lib/accounting/fixedAssets";
import { syncMissingFixedAssets } from "@/lib/accounting/fixedAssetSync";
import FixedAssetRegister, { type FixedAssetRow } from "@/components/accounting/FixedAssetRegister";

export const dynamic = "force-dynamic";

function period(searchParams: { year?: string; month?: string }) {
  const now = new Date();
  const year = Number(searchParams.year);
  const month = Number(searchParams.month);
  return {
    year: Number.isInteger(year) && year >= 2000 && year <= 2200 ? year : now.getUTCFullYear(),
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : now.getUTCMonth() + 1,
  };
}

export default async function FixedAssetsPage({ searchParams }: { searchParams: { year?: string; month?: string; q?: string; category?: string; status?: string; branch?: string } }) {
  const staff = await requireSectionPage("ACCOUNTING");
  const { year, month } = period(searchParams);
  // ใบสำคัญเก่าที่ผ่านรายการก่อนเปิดใช้ทะเบียนต้องถูกเติมครั้งเดียว และ sourceLineId ป้องกันการสร้างซ้ำ
  if (staff.permissions.ACCOUNTING.canEdit) await syncMissingFixedAssets(staff.staffId);
  const [assets, accounts, branches] = await Promise.all([
    loadDepreciationSchedule(year, month),
    prisma.accAccount.findMany({
      where: { type: "ASSET", isPostable: true, parentCode: "1600", code: { not: "1690" } },
      orderBy: { code: "asc" },
      select: { id: true, code: true, nameTh: true },
    }),
    prisma.branch.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);

  const rows: FixedAssetRow[] = assets.map((asset) => ({
    id: asset.id,
    code: asset.code,
    name: asset.name,
    category: asset.category,
    status: asset.status,
    quantity: asset.quantity,
    remainingQuantity: asset.remainingQuantity,
    purchaseDate: asset.purchaseDate.toISOString(),
    availableDate: asset.availableDate.toISOString(),
    invoiceNo: asset.invoiceNo,
    branchId: asset.branchId,
    branchName: asset.branchName,
    assetAccountId: asset.assetAccountId,
    accountLabel: `${asset.assetAccount.code} ${asset.assetAccount.nameTh}`,
    dataIncomplete: asset.dataIncomplete,
    costSatang: asset.costSatang,
    accumulatedSatang: asset.accumulatedSatang,
    monthDepreciationSatang: asset.monthDepreciationSatang,
    bookValueSatang: asset.bookValueSatang,
    usefulLifeMonths: asset.usefulLifeMonths,
    residualValueSatang: asset.residualValueSatang,
    note: asset.note,
  }));

  return <FixedAssetRegister
    initialAssets={rows}
    accounts={accounts.map((account) => ({ id: account.id, label: `${account.code} ${account.nameTh}` }))}
    branches={branches.map((branch) => ({ id: branch.id, label: branch.name }))}
    year={year}
    month={month}
    canEdit={staff.permissions.ACCOUNTING.canEdit}
    initialFilters={{
      query: searchParams.q ?? "",
      category: searchParams.category ?? "ALL",
      status: searchParams.status ?? "ALL",
      branch: searchParams.branch ?? "ALL",
    }}
  />;
}
