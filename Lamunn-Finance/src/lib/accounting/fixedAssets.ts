import { prisma, type AccFixedAssetCategory } from "@lamunn/db-finance";
import { createEntry, AccountingError } from "./post";
import { toBaht, toSatang, type Money } from "./money";

export const FIXED_ASSET_CATEGORY_LABELS: Record<AccFixedAssetCategory, string> = {
  LAND: "ที่ดิน",
  BUILDING: "อาคาร",
  OFFICE_EQUIPMENT: "อุปกรณ์สำนักงาน",
  COMPUTER: "คอมพิวเตอร์และอุปกรณ์คอมพิวเตอร์",
  FURNITURE: "เครื่องตกแต่งสำนักงาน",
  MACHINERY: "เครื่องจักรและอุปกรณ์ในโรงงาน",
  VEHICLE: "ยานพาหนะ",
  SOFTWARE: "ซอฟต์แวร์คอมพิวเตอร์",
};

export const FIXED_ASSET_POLICIES: Record<AccFixedAssetCategory, { months: number; taxRate: number | null; prefix: string }> = {
  LAND: { months: 0, taxRate: null, prefix: "LAN" },
  BUILDING: { months: 240, taxRate: 5, prefix: "BLD" },
  OFFICE_EQUIPMENT: { months: 60, taxRate: 20, prefix: "OFF" },
  COMPUTER: { months: 36, taxRate: 33.3333, prefix: "COM" },
  FURNITURE: { months: 60, taxRate: 20, prefix: "FUR" },
  MACHINERY: { months: 60, taxRate: 20, prefix: "MAC" },
  VEHICLE: { months: 60, taxRate: 20, prefix: "VEH" },
  SOFTWARE: { months: 36, taxRate: 20, prefix: "SOF" },
};

type DepreciableAsset = {
  quantity: number;
  unitCost: Money;
  residualValue: Money;
  availableDate: Date;
  usefulLifeMonths: number;
};

type AssetDisposal = { quantity: number; saleDate: Date };

function utcDay(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function addUtcMonths(date: Date, months: number) {
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

function elapsedDays(start: Date, endInclusive: Date) {
  if (utcDay(endInclusive) < utcDay(start)) return 0;
  return Math.floor((utcDay(endInclusive) - utcDay(start)) / 86_400_000) + 1;
}

/** คิดยอดสะสมแบบรายวันตั้งแต่พร้อมใช้และปัดเป็นสตางค์ โดยไม่ให้เกินฐานที่คิดค่าเสื่อม */
export function accumulatedDepreciationSatang(asset: DepreciableAsset, asOf: Date) {
  if (asset.usefulLifeMonths <= 0) return 0;
  const cost = toSatang(asset.unitCost) * asset.quantity;
  const residual = toSatang(asset.residualValue);
  const depreciable = Math.max(0, cost - residual);
  const endExclusive = addUtcMonths(asset.availableDate, asset.usefulLifeMonths);
  const fullDays = Math.max(1, elapsedDays(asset.availableDate, new Date(utcDay(endExclusive) - 86_400_000)));
  const usedDays = Math.min(fullDays, elapsedDays(asset.availableDate, asOf));
  return Math.min(depreciable, Math.round((depreciable * usedDays) / fullDays));
}

export function depreciationForMonthSatang(asset: DepreciableAsset, year: number, month: number) {
  const end = new Date(Date.UTC(year, month, 0));
  const previousEnd = new Date(Date.UTC(year, month - 1, 0));
  return Math.max(0, accumulatedDepreciationSatang(asset, end) - accumulatedDepreciationSatang(asset, previousEnd));
}

/** ยอดสะสมเพื่อคำนวณค่าเสื่อมของงวด: ส่วนที่ขายหยุดคิด ณ วันที่ขาย ส่วนที่เหลือคิดต่อถึงวันสิ้นงวด */
function historicalAccumulatedSatang(asset: DepreciableAsset & { disposals: AssetDisposal[] }, asOf: Date) {
  const totalResidual = toSatang(asset.residualValue);
  let disposedQuantity = 0;
  let accumulated = 0;
  for (const disposal of asset.disposals.filter((item) => item.saleDate <= asOf)) {
    disposedQuantity += disposal.quantity;
    accumulated += accumulatedDepreciationSatang({
      ...asset,
      quantity: disposal.quantity,
      residualValue: toBaht(Math.round((totalResidual * disposal.quantity) / asset.quantity)),
    }, disposal.saleDate);
  }
  const remainingQuantity = Math.max(0, asset.quantity - disposedQuantity);
  if (remainingQuantity > 0) {
    accumulated += accumulatedDepreciationSatang({
      ...asset,
      quantity: remainingQuantity,
      residualValue: toBaht(Math.round((totalResidual * remainingQuantity) / asset.quantity)),
    }, asOf);
  }
  return accumulated;
}

function remainingAccumulatedSatang(asset: DepreciableAsset & { disposals: AssetDisposal[] }, asOf: Date) {
  const disposedQuantity = asset.disposals
    .filter((item) => item.saleDate <= asOf)
    .reduce((sum, item) => sum + item.quantity, 0);
  const remainingQuantity = Math.max(0, asset.quantity - disposedQuantity);
  if (remainingQuantity === 0) return { remainingQuantity, accumulated: 0 };
  const residual = Math.round((toSatang(asset.residualValue) * remainingQuantity) / asset.quantity);
  return {
    remainingQuantity,
    accumulated: accumulatedDepreciationSatang({ ...asset, quantity: remainingQuantity, residualValue: toBaht(residual) }, asOf),
  };
}

function assetCode(category: AccFixedAssetCategory) {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  return `AST-${FIXED_ASSET_POLICIES[category].prefix}-${suffix}`;
}

export async function createManualFixedAssets(input: {
  name: string;
  category: AccFixedAssetCategory;
  quantity: number;
  purchaseDate: Date;
  availableDate: Date;
  unitCostSatang: number;
  residualValueSatang: number;
  usefulLifeMonths?: number;
  invoiceNo?: string | null;
  branchId?: string | null;
  assetAccountId: string;
  note?: string | null;
  createdBy?: string | null;
}) {
  const policy = FIXED_ASSET_POLICIES[input.category];
  if (!input.name.trim()) throw new AccountingError("กรุณาระบุชื่อทรัพย์สิน");
  if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new AccountingError("จำนวนทรัพย์สินต้องมากกว่า 0");
  if (input.unitCostSatang <= 0) throw new AccountingError("ราคาทุนต้องมากกว่า 0");
  if (input.residualValueSatang < 0 || input.residualValueSatang > input.unitCostSatang * input.quantity) {
    throw new AccountingError("มูลค่าซากต้องไม่ติดลบและไม่เกินราคาทุนรวม");
  }
  if (input.availableDate < input.purchaseDate) throw new AccountingError("วันที่พร้อมใช้ต้องไม่ก่อนวันที่ซื้อ");

  const account = await prisma.accAccount.findFirst({ where: { id: input.assetAccountId, type: "ASSET", parentCode: "1600", code: { not: "1690" }, isPostable: true } });
  if (!account) throw new AccountingError("บัญชีสินทรัพย์ไม่ถูกต้อง");

  return prisma.accFixedAsset.create({
    data: {
      code: assetCode(input.category),
      name: input.name.trim(),
      category: input.category,
      quantity: input.quantity,
      purchaseDate: input.purchaseDate,
      availableDate: input.availableDate,
      unitCost: toBaht(input.unitCostSatang),
      residualValue: toBaht(input.residualValueSatang),
      usefulLifeMonths: input.category === "LAND" ? 0 : (input.usefulLifeMonths ?? policy.months),
      taxRatePercent: policy.taxRate,
      invoiceNo: input.invoiceNo?.trim() || null,
      branchId: input.branchId || null,
      assetAccountId: input.assetAccountId,
      note: input.note?.trim() || null,
      dataIncomplete: !input.invoiceNo || !input.branchId,
      createdBy: input.createdBy ?? null,
    },
  });
}

export async function loadFixedAssetRegister(asOf = new Date()) {
  const [assets, branches] = await Promise.all([
    prisma.accFixedAsset.findMany({
      orderBy: [{ status: "asc" }, { code: "asc" }],
      include: {
        assetAccount: { select: { code: true, nameTh: true } },
        sourceLine: { select: { entry: { select: { id: true, entryNo: true } } } },
        disposals: { orderBy: { saleDate: "asc" } },
      },
    }),
    prisma.branch.findMany({ select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const branchMap = new Map(branches.map((branch) => [branch.id, branch.name]));
  return assets.map((asset) => {
    const { remainingQuantity, accumulated } = remainingAccumulatedSatang(asset, asOf);
    const cost = toSatang(asset.unitCost) * remainingQuantity;
    const soldQuantity = asset.quantity - remainingQuantity;
    return {
      ...asset,
      unitCostSatang: toSatang(asset.unitCost),
      residualValueSatang: toSatang(asset.residualValue),
      costSatang: cost,
      accumulatedSatang: accumulated,
      bookValueSatang: Math.max(0, cost - accumulated),
      soldQuantity,
      remainingQuantity,
      branchName: asset.branchId ? branchMap.get(asset.branchId) ?? "ไม่พบสาขา" : null,
    };
  });
}

export async function loadDepreciationSchedule(year: number, month: number) {
  const assets = await loadFixedAssetRegister(new Date(Date.UTC(year, month, 0)));
  const end = new Date(Date.UTC(year, month, 0));
  const previousEnd = new Date(Date.UTC(year, month - 1, 0));
  return assets.map((asset) => ({
    ...asset,
    monthDepreciationSatang: Math.max(0, historicalAccumulatedSatang(asset, end) - historicalAccumulatedSatang(asset, previousEnd)),
  }));
}

export async function createDepreciationDraft(year: number, month: number, userId?: string | null) {
  const [expense, accumulated] = await Promise.all([
    prisma.accAccount.findUnique({ where: { code: "5810" } }),
    prisma.accAccount.findUnique({ where: { code: "1690" } }),
  ]);
  if (!expense || !accumulated) throw new AccountingError("ไม่พบบัญชีค่าเสื่อมราคา 5810 หรือค่าเสื่อมราคาสะสม 1690");
  const schedule = await loadDepreciationSchedule(year, month);
  const lines = schedule.flatMap((asset) => {
    if (asset.monthDepreciationSatang <= 0) return [];
    const amount = toBaht(asset.monthDepreciationSatang);
    return [
      { accountId: expense.id, debit: amount, branchId: asset.branchId, memo: `${asset.code} ${asset.name}` },
      { accountId: accumulated.id, credit: amount, branchId: asset.branchId, memo: `${asset.code} ${asset.name}` },
    ];
  });
  if (lines.length === 0) throw new AccountingError("งวดนี้ไม่มีค่าเสื่อมราคาที่ต้องบันทึก");
  return createEntry({
    date: new Date(Date.UTC(year, month, 0)),
    journalType: "ADJUST",
    description: `ค่าเสื่อมราคาทรัพย์สิน ${String(month).padStart(2, "0")}/${year}`,
    sourceType: "FIXED_ASSET_DEPRECIATION",
    sourceKey: `${year}-${String(month).padStart(2, "0")}`,
    status: "DRAFT",
    userId,
    lines,
  });
}

export async function disposeFixedAsset(input: {
  assetId: string;
  saleDate: Date;
  quantity: number;
  saleBaseSatang: number;
  vatSatang: number;
  buyer?: string | null;
  documentNo?: string | null;
  note?: string | null;
  userId?: string | null;
}) {
  const asset = await prisma.accFixedAsset.findUnique({
    where: { id: input.assetId },
    include: { disposals: true, assetAccount: true },
  });
  if (!asset) throw new AccountingError("ไม่พบทรัพย์สิน");
  const sold = asset.disposals.reduce((sum, item) => sum + item.quantity, 0);
  const remaining = asset.quantity - sold;
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > remaining) {
    throw new AccountingError(`จำนวนที่ขายต้องอยู่ระหว่าง 1 ถึง ${remaining}`);
  }
  if (input.saleDate < asset.availableDate) throw new AccountingError("วันที่ขายต้องไม่ก่อนวันที่พร้อมใช้งาน");
  if (input.saleBaseSatang < 0 || input.vatSatang < 0) throw new AccountingError("ราคาขายและภาษีต้องไม่ติดลบ");

  const accounts = await prisma.accAccount.findMany({ where: { code: { in: ["1110", "1690", "2103", "4990", "5490"] } } });
  const byCode = new Map(accounts.map((account) => [account.code, account]));
  for (const code of ["1110", "1690", "2103", "4990", "5490"]) {
    if (!byCode.has(code)) throw new AccountingError(`ไม่พบบัญชี ${code} สำหรับบันทึกการขายทรัพย์สิน`);
  }

  const costSatang = toSatang(asset.unitCost) * input.quantity;
  const totalAccumulated = accumulatedDepreciationSatang(asset, input.saleDate);
  const accumulatedSatang = Math.round((totalAccumulated * input.quantity) / asset.quantity);
  const bookValueSatang = Math.max(0, costSatang - accumulatedSatang);
  const gainLossSatang = input.saleBaseSatang - bookValueSatang;
  const branchId = asset.branchId;
  const memo = `${asset.code} ${asset.name} จำนวน ${input.quantity}`;
  const lines = [
    { accountId: byCode.get("1110")!.id, debit: toBaht(input.saleBaseSatang + input.vatSatang), branchId, memo, docNo: input.documentNo },
    ...(accumulatedSatang > 0 ? [{ accountId: byCode.get("1690")!.id, debit: toBaht(accumulatedSatang), branchId, memo }] : []),
    ...(gainLossSatang < 0 ? [{ accountId: byCode.get("5490")!.id, debit: toBaht(-gainLossSatang), branchId, memo: `ขาดทุนจากการขาย ${memo}` }] : []),
    { accountId: asset.assetAccountId, credit: toBaht(costSatang), branchId, memo },
    ...(input.vatSatang > 0 ? [{ accountId: byCode.get("2103")!.id, credit: toBaht(input.vatSatang), branchId, memo, docNo: input.documentNo }] : []),
    ...(gainLossSatang > 0 ? [{ accountId: byCode.get("4990")!.id, credit: toBaht(gainLossSatang), branchId, memo: `กำไรจากการขาย ${memo}` }] : []),
  ];
  const draft = await createEntry({
    date: input.saleDate,
    journalType: "GENERAL",
    description: `ขายทรัพย์สิน ${memo}`,
    sourceType: "FIXED_ASSET_DISPOSAL",
    sourceKey: `${asset.id}:${sold + input.quantity}`,
    status: "DRAFT",
    userId: input.userId,
    lines,
  });
  const disposal = await prisma.accFixedAssetDisposal.create({
    data: {
      assetId: asset.id,
      saleDate: input.saleDate,
      quantity: input.quantity,
      saleBaseAmount: toBaht(input.saleBaseSatang),
      vatAmount: toBaht(input.vatSatang),
      buyer: input.buyer?.trim() || null,
      documentNo: input.documentNo?.trim() || null,
      note: input.note?.trim() || null,
      draftEntryId: draft.id,
      createdBy: input.userId ?? null,
    },
  });
  if (sold + input.quantity === asset.quantity) {
    await prisma.accFixedAsset.update({ where: { id: asset.id }, data: { status: "DISPOSED" } });
  }
  return { disposal, draft, bookValueSatang, gainLossSatang };
}
