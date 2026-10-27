import { prisma } from "@lamunn/db-finance";
import { requireSectionPage } from "@/lib/permissions";
import MenuItemsManager from "@/components/catering/MenuItemsManager";
import MinimumOrderForm from "@/components/catering/MinimumOrderForm";

export default async function CateringMenuPage() {
  await requireSectionPage("CATERING");

  const [items, settingRows] = await Promise.all([
    prisma.cateringMenuItem.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }] }),
    prisma.setting.findMany({ where: { key: { in: ["cateringMinWithBooth", "cateringMinNoBooth"] } } }),
  ]);
  const settingMap = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">จัดการเมนู / ราคา Catering</h1>
        <p className="mt-1 text-sm text-gray-500">
          รายการในหน้านี้เป็นแค่ "คำแนะนำ" — ในหน้างานจัดเลี้ยง พนักงานกรอกรายการเองทีละรายการ พอพิมพ์ชื่อ รายการที่เปิดใช้งานอยู่ที่นี่จะขึ้นมาให้เลือกพร้อมเติมราคาตั้งต้นให้ (แก้ราคาได้ ยกเว้นต่ำกว่าราคาขั้นต่ำที่ตั้งไว้)
        </p>
      </div>

      <MinimumOrderForm
        minWithBooth={Number(settingMap.cateringMinWithBooth ?? 10000)}
        minNoBooth={Number(settingMap.cateringMinNoBooth ?? 6000)}
      />

      <MenuItemsManager items={items} />
    </div>
  );
}
