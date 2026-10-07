import { prisma } from "@lamunn/db-finance";
import { requireSectionPage } from "@/lib/permissions";
import AddPartnerForm from "@/components/accounting/AddPartnerForm";
import ImportPartnersButton from "@/components/accounting/ImportPartnersButton";
import PartnerList from "@/components/accounting/PartnerList";

export const dynamic = "force-dynamic";

export default async function PartnersPage() {
  const { permissions } = await requireSectionPage("ACCOUNTING");
  const canEdit = permissions.ACCOUNTING.canEdit;

  const [partners, usage] = await Promise.all([
    prisma.accPartner.findMany({ orderBy: { name: "asc" } }),
    prisma.accJournalLine.groupBy({ by: ["partnerId"], _count: { _all: true } }),
  ]);
  const usedCount = new Map(usage.filter((u) => u.partnerId).map((u) => [u.partnerId as string, u._count._all]));

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-gray-900">คู่ค้า (ลูกหนี้/เจ้าหนี้)</h1>
      <p className="mb-4 text-sm text-gray-500">
        ฐานข้อมูลคนที่เราจ่ายเงินให้หรือค้างรับจาก — เลือกได้จากช่อง &ldquo;ซัพพลายเออร์&rdquo; ตอนคีย์ใบสำคัญ
        คู่ค้าที่เคยใช้ในใบสำคัญแล้วลบไม่ได้ ปิดใช้งานแทนได้
      </p>

      {canEdit && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <AddPartnerForm />
          <ImportPartnersButton />
        </div>
      )}

      <PartnerList
        canEdit={canEdit}
        partners={partners.map((p) => ({
          id: p.id,
          name: p.name,
          type: p.type,
          phone: p.phone,
          taxId: p.taxId,
          branchTag: p.branchTag,
          address: p.address,
          note: p.note,
          isActive: p.isActive,
          usedCount: usedCount.get(p.id) ?? 0,
        }))}
      />
    </div>
  );
}
