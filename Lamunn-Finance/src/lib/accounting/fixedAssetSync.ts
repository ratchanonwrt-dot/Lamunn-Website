import { prisma } from "@lamunn/db-finance";

const CATEGORY_RULES = [
  { category: "LAND" as const, prefix: "LAN", words: ["ที่ดิน"] },
  { category: "BUILDING" as const, prefix: "BLD", words: ["อาคาร", "สิ่งปลูกสร้าง"] },
  { category: "SOFTWARE" as const, prefix: "SOF", words: ["ซอฟต์แวร์", "software", "license", "ลิขสิทธิ์"] },
  { category: "VEHICLE" as const, prefix: "VEH", words: ["ยานพาหนะ", "รถยนต์", "รถจักรยานยนต์"] },
  { category: "COMPUTER" as const, prefix: "COM", words: ["คอมพิวเตอร์", "notebook", "macbook", "เครื่องพิมพ์"] },
  { category: "FURNITURE" as const, prefix: "FUR", words: ["ตกแต่ง", "เฟอร์นิเจอร์", "โต๊ะ", "เก้าอี้", "เคาน์เตอร์"] },
  { category: "MACHINERY" as const, prefix: "MAC", words: ["เครื่องจักร", "เตาอบ", "เครื่องตี", "เครื่องผลิต"] },
] as const;

function assetPolicy(text: string) {
  const normalized = text.toLowerCase();
  const match = CATEGORY_RULES.find((rule) => rule.words.some((word) => normalized.includes(word)));
  switch (match?.category) {
    case "LAND": return { category: "LAND" as const, prefix: "LAN", usefulLifeMonths: 0, taxRatePercent: null };
    case "BUILDING": return { category: "BUILDING" as const, prefix: "BLD", usefulLifeMonths: 240, taxRatePercent: 5 };
    case "COMPUTER": return { category: "COMPUTER" as const, prefix: "COM", usefulLifeMonths: 36, taxRatePercent: 33.3333 };
    case "FURNITURE": return { category: "FURNITURE" as const, prefix: "FUR", usefulLifeMonths: 60, taxRatePercent: 20 };
    case "MACHINERY": return { category: "MACHINERY" as const, prefix: "MAC", usefulLifeMonths: 60, taxRatePercent: 20 };
    case "VEHICLE": return { category: "VEHICLE" as const, prefix: "VEH", usefulLifeMonths: 60, taxRatePercent: 20 };
    case "SOFTWARE": return { category: "SOFTWARE" as const, prefix: "SOF", usefulLifeMonths: 36, taxRatePercent: 20 };
    default: return { category: "OFFICE_EQUIPMENT" as const, prefix: "OFF", usefulLifeMonths: 60, taxRatePercent: 20 };
  }
}

/** สร้างทะเบียนจากใบสำคัญที่ผ่านรายการแล้วเท่านั้น และใช้ sourceLineId กันการสร้างซ้ำ */
export async function syncFixedAssetsFromPostedEntry(entryId: string, createdBy?: string | null) {
  const entry = await prisma.accJournalEntry.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      status: true,
      date: true,
      description: true,
      lines: {
        where: { debit: { gt: 0 }, account: { parentCode: "1600", code: { not: "1690" }, isPostable: true } },
        select: {
          id: true,
          debit: true,
          memo: true,
          docNo: true,
          branchId: true,
          accountId: true,
          account: { select: { code: true, nameTh: true } },
        },
      },
    },
  });
  if (!entry || entry.status !== "POSTED") return [];

  const created = [];
  for (const line of entry.lines) {
    const text = `${line.account.nameTh} ${line.memo ?? ""} ${entry.description}`;
    const policy = assetPolicy(text);
    const code = `AST-${policy.prefix}-${line.id.slice(-8).toUpperCase()}`;
    const asset = await prisma.accFixedAsset.upsert({
      where: { sourceLineId: line.id },
      create: {
        code,
        name: line.memo?.trim() || entry.description,
        category: policy.category,
        quantity: 1,
        purchaseDate: entry.date,
        availableDate: entry.date,
        unitCost: line.debit,
        usefulLifeMonths: policy.usefulLifeMonths,
        taxRatePercent: policy.taxRatePercent,
        invoiceNo: line.docNo,
        branchId: line.branchId,
        note: `สร้างอัตโนมัติจากบัญชี ${line.account.code} ${line.account.nameTh}`,
        dataIncomplete: !line.memo?.trim() || !line.docNo || !line.branchId,
        assetAccountId: line.accountId,
        sourceLineId: line.id,
        createdBy: createdBy ?? null,
      },
      // การผ่านรายการซ้ำมีหน้าที่เติมทะเบียนที่หายไปเท่านั้น ห้ามเขียนทับข้อมูลที่คนแก้แล้ว
      update: {},
    });
    created.push(asset);
  }
  return created;
}

/** เติมรายการย้อนหลังเมื่อเปิดทะเบียนครั้งแรก โดยเลือกเฉพาะบรรทัดสินทรัพย์ที่ยังไม่มีทะเบียน */
export async function syncMissingFixedAssets(createdBy?: string | null) {
  const lines = await prisma.accJournalLine.findMany({
    where: {
      status: "POSTED",
      debit: { gt: 0 },
      account: { parentCode: "1600", code: { not: "1690" }, isPostable: true },
      fixedAsset: null,
    },
    distinct: ["entryId"],
    select: { entryId: true },
  });
  for (const line of lines) await syncFixedAssetsFromPostedEntry(line.entryId, createdBy);
  return lines.length;
}
