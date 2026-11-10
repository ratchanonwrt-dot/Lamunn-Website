/** พิสูจน์ทะเบียนทรัพย์สิน: สร้างอัตโนมัติจากใบผ่านรายการ, ค่าเสื่อม, ขาย และใบสำคัญร่าง
 * รัน: npx tsx scripts/verify-fixed-assets.ts
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
const YEAR = 2099;
let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? "ผ่าน  " : "ไม่ผ่าน ❌"}  ${label}${ok ? "" : ` (ได้ ${JSON.stringify(actual)} ควรเป็น ${JSON.stringify(expected)})`}`);
  if (!ok) failures++;
}

async function main() {
  const [{ prisma }, { createEntry, postEntry, unpostEntry }, fixedAssets] = await Promise.all([
    import("@lamunn/db-finance"),
    import("../src/lib/accounting/post"),
    import("../src/lib/accounting/fixedAssets"),
  ]);
  const accountIds: string[] = [];
  const entryIds: string[] = [];
  const assetIds: string[] = [];
  const disposalIds: string[] = [];
  const createdPeriodIds: string[] = [];
  const months = [1, 5, 6];

  try {
    const periodBefore = new Map<number, string | null>();
    for (const month of months) {
      const period = await prisma.accPeriod.findUnique({ where: { year_month: { year: YEAR, month } } });
      periodBefore.set(month, period?.id ?? null);
    }
    const stamp = Date.now().toString(36).toUpperCase();
    const assetAccount = await prisma.accAccount.create({ data: { code: `[test]-FA-${stamp}`, nameTh: "[test] อุปกรณ์สำนักงาน", type: "ASSET", parentCode: "1600" } });
    const offset = await prisma.accAccount.create({ data: { code: `[test]-FA-OFF-${stamp}`, nameTh: "[test] บัญชีคู่", type: "LIABILITY", parentCode: "2100" } });
    accountIds.push(assetAccount.id, offset.id);

    const source = await createEntry({
      date: new Date(Date.UTC(YEAR, 0, 1)),
      description: "[test] ซื้อ Notebook ทดสอบทะเบียนทรัพย์สิน",
      status: "POSTED",
      lines: [
        { accountId: assetAccount.id, debit: 36_000, memo: "[test] Notebook", docNo: "[test]-INV-001" },
        { accountId: offset.id, credit: 36_000 },
      ],
    });
    entryIds.push(source.id);
    const auto = await prisma.accFixedAsset.findFirstOrThrow({ where: { sourceLine: { entryId: source.id } } });
    assetIds.push(auto.id);
    console.log("\n=== สร้างทะเบียนอัตโนมัติ ===");
    check("สร้างจากใบสำคัญ POSTED หนึ่งครั้ง", await prisma.accFixedAsset.count({ where: { sourceLine: { entryId: source.id } } }), 1);
    check("ชื่อรายการมาจาก memo", auto.name, "[test] Notebook");
    check("รายการไม่มีสาขาติดสถานะข้อมูลไม่ครบ", auto.dataIncomplete, true);
    await unpostEntry(source.id);
    check("ถอนผ่านรายการแล้วนำทะเบียนอัตโนมัติออก", await prisma.accFixedAsset.count({ where: { sourceLine: { entryId: source.id } } }), 0);
    await postEntry(source.id);
    const recreated = await prisma.accFixedAsset.findFirstOrThrow({ where: { sourceLine: { entryId: source.id } } });
    assetIds.push(recreated.id);
    check("ผ่านรายการอีกครั้งแล้วสร้างทะเบียนกลับหนึ่งรายการ", await prisma.accFixedAsset.count({ where: { sourceLine: { entryId: source.id } } }), 1);

    const manual = await fixedAssets.createManualFixedAssets({
      name: "[test] เครื่องพิมพ์",
      category: "COMPUTER",
      quantity: 2,
      purchaseDate: new Date(Date.UTC(YEAR, 0, 1)),
      availableDate: new Date(Date.UTC(YEAR, 0, 1)),
      unitCostSatang: 1_000_000,
      residualValueSatang: 0,
      assetAccountId: assetAccount.id,
      invoiceNo: "[test]-INV-002",
    });
    assetIds.push(manual.id);
    check("เพิ่มเองและเก็บจำนวน", manual.quantity, 2);
    check("คอมพิวเตอร์ใช้อายุเริ่มต้น 36 เดือน", manual.usefulLifeMonths, 36);
    check("QR เปิดหน้ารายละเอียดทรัพย์สินรายการเดียว", fixedAssets.fixedAssetDetailUrl("https://lamunn-finance.vercel.app", manual.id), `https://lamunn-finance.vercel.app/accounting/fixed-assets/${manual.id}`);

    const schedule = await fixedAssets.loadDepreciationSchedule(YEAR, 5);
    const manualSchedule = schedule.find((item) => item.id === manual.id)!;
    check("ค่าเสื่อมเดือนพฤษภาคมมากกว่าศูนย์", manualSchedule.monthDepreciationSatang > 0, true);
    check("มูลค่าคงเหลือไม่ติดลบ", manualSchedule.bookValueSatang >= 0, true);

    const depreciation = await fixedAssets.createDepreciationDraft(YEAR, 5);
    entryIds.push(depreciation.id);
    const depreciationEntry = await prisma.accJournalEntry.findUniqueOrThrow({ where: { id: depreciation.id }, include: { lines: true } });
    check("ใบค่าเสื่อมเป็นร่าง", depreciationEntry.status, "DRAFT");
    check("ใบค่าเสื่อมเดบิตเท่ากับเครดิต", depreciationEntry.lines.reduce((sum, line) => sum + Number(line.debit), 0), depreciationEntry.lines.reduce((sum, line) => sum + Number(line.credit), 0));

    const disposal = await fixedAssets.disposeFixedAsset({
      assetId: manual.id,
      saleDate: new Date(Date.UTC(YEAR, 5, 15)),
      quantity: 1,
      saleBaseSatang: 800_000,
      vatSatang: 56_000,
      buyer: "[test] ผู้ซื้อ",
      documentNo: "[test]-SALE-001",
    });
    disposalIds.push(disposal.disposal.id);
    entryIds.push(disposal.draft.id);
    check("ขายบางส่วนหนึ่งชิ้น", disposal.disposal.quantity, 1);
    check("ขายบางส่วนยังไม่ปิดสถานะทรัพย์สิน", (await prisma.accFixedAsset.findUniqueOrThrow({ where: { id: manual.id } })).status, "ACTIVE");
    check("ใบขายเป็นร่าง", disposal.draft.status, "DRAFT");
    const disposalLines = await prisma.accJournalLine.findMany({ where: { entryId: disposal.draft.id } });
    check("ใบขายเดบิตเท่ากับเครดิต", disposalLines.reduce((sum, line) => sum + Number(line.debit), 0), disposalLines.reduce((sum, line) => sum + Number(line.credit), 0));

    const afterPartialSale = (await fixedAssets.loadDepreciationSchedule(YEAR, 7)).find((item) => item.id === manual.id)!;
    check("ขายครึ่งหนึ่งแล้วเดือนถัดไปยังคิดค่าเสื่อมเฉพาะจำนวนคงเหลือ", afterPartialSale.monthDepreciationSatang > 0 && afterPartialSale.monthDepreciationSatang < manualSchedule.monthDepreciationSatang, true);
    check("ราคาทุนคงเหลือหลังขายหนึ่งจากสองชิ้น", afterPartialSale.costSatang, 1_000_000);

    for (const month of months) {
      const period = await prisma.accPeriod.findUnique({ where: { year_month: { year: YEAR, month } } });
      if (!periodBefore.get(month) && period) createdPeriodIds.push(period.id);
    }
  } finally {
    console.log("\n=== ลบข้อมูลทดสอบตาม id ===");
    for (const id of disposalIds.reverse()) await prisma.accFixedAssetDisposal.delete({ where: { id } }).catch(() => undefined);
    for (const id of assetIds.reverse()) await prisma.accFixedAsset.delete({ where: { id } }).catch(() => undefined);
    for (const id of entryIds.reverse()) await prisma.accJournalEntry.delete({ where: { id } }).catch(() => undefined);
    for (const id of accountIds.reverse()) await prisma.accAccount.delete({ where: { id } }).catch(() => undefined);
    for (const id of createdPeriodIds.reverse()) await prisma.accPeriod.delete({ where: { id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
  console.log(failures === 0 ? "\n✅ ผ่านทั้งหมด\n" : `\n❌ ไม่ผ่าน ${failures} ข้อ\n`);
  process.exit(failures === 0 ? 0 : 1);
}

async function run() {
  if (process.argv.includes("--pure")) {
    const fixedAssets = await import("../src/lib/accounting/fixedAssets");
    check("QR เปิดหน้ารายละเอียดทรัพย์สินรายการเดียว", fixedAssets.fixedAssetDetailUrl("https://lamunn-finance.vercel.app", "[test]-asset-id"), "https://lamunn-finance.vercel.app/accounting/fixed-assets/%5Btest%5D-asset-id");
    console.log(failures === 0 ? "\n✅ ผ่านทั้งหมด\n" : `\n❌ ไม่ผ่าน ${failures} ข้อ\n`);
    process.exit(failures === 0 ? 0 : 1);
  }
  await main();
}

run();
