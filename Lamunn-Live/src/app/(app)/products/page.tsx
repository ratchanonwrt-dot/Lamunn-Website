import { prisma } from "@lamunn/db-live";
import { requirePageRole } from "@/lib/requirePageRole";
import { EDITOR_ROLES } from "@/lib/requireStaff";
import ProductManager from "@/components/ProductManager";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  await requirePageRole(EDITOR_ROLES);
  const products = await prisma.liveProduct.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { orderLines: true } } },
  });
  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-semibold tracking-tight text-ink">สินค้า / ต้นทุนวัตถุดิบ</h1>
      <p className="mb-6 max-w-3xl text-sm text-muted">
        ชุดที่ขายในไลฟ์และต้นทุนวัตถุดิบต่อชุด — ใช้ตอนกรอกออเดอร์ในหน้ากะ ระบบคูณจำนวนชุดกับต้นทุนต่อชุดเป็นต้นทุนวัตถุดิบจริงในหน้าสรุปกำไร
        แก้ต้นทุนทีหลังมีผลกับออเดอร์ที่กรอกหลังจากนั้น ออเดอร์เก่ายังใช้ต้นทุน ณ ตอนกรอก
      </p>
      <ProductManager products={products.map((p) => ({ id: p.id, name: p.name, costPerSet: p.costPerSet, isActive: p.isActive, usedInOrders: p._count.orderLines }))} />
    </div>
  );
}
