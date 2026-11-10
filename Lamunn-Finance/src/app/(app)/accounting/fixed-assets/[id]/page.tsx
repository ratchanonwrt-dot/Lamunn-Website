import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSectionPage } from "@/lib/permissions";
import { FIXED_ASSET_CATEGORY_LABELS, loadFixedAssetRegister } from "@/lib/accounting/fixedAssets";
import { formatAccountingDate } from "@/lib/accounting/dateFormat";
import { fmtSatang, toSatang } from "@/lib/accounting/money";

export const dynamic = "force-dynamic";

export default async function FixedAssetDetailPage({ params }: { params: { id: string } }) {
  await requireSectionPage("ACCOUNTING");
  const asset = (await loadFixedAssetRegister()).find((item) => item.id === params.id);
  if (!asset) notFound();

  const money = (satang: number) => fmtSatang(satang, { zeroDash: false });
  return <div className="mx-auto max-w-4xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-brand-700">รายละเอียดทรัพย์สิน</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">{asset.name}</h1>
        <p className="mt-1 font-mono text-sm font-semibold text-gray-600">{asset.code}</p>
      </div>
      <span className={`rounded-full px-3 py-1 text-sm font-semibold ${asset.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"}`}>
        {asset.status === "ACTIVE" ? "ใช้งาน" : "ขายแล้ว"}
      </span>
    </div>

    <section className="grid gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:grid-cols-2">
      <Detail label="หมวดทรัพย์สิน" value={FIXED_ASSET_CATEGORY_LABELS[asset.category]} />
      <Detail label="สาขาที่ตั้ง" value={asset.branchName || "ยังไม่ระบุสาขา"} emphasize />
      <Detail label="วันที่ซื้อตามใบกำกับ" value={formatAccountingDate(asset.purchaseDate)} />
      <Detail label="วันที่พร้อมใช้งาน" value={formatAccountingDate(asset.availableDate)} />
      <Detail label="จำนวนคงเหลือ" value={`${asset.remainingQuantity} จาก ${asset.quantity}`} />
      <Detail label="เลขที่ใบกำกับ" value={asset.invoiceNo || "ไม่ระบุ"} />
      <Detail label="บัญชีสินทรัพย์" value={`${asset.assetAccount.code} ${asset.assetAccount.nameTh}`} />
      <Detail label="อายุการใช้งาน" value={asset.usefulLifeMonths > 0 ? `${asset.usefulLifeMonths} เดือน` : "ไม่คิดค่าเสื่อมราคา"} />
      <Detail label="ราคาทุนคงเหลือ" value={`${money(asset.costSatang)} บาท`} />
      <Detail label="ค่าเสื่อมราคาสะสม" value={`${money(asset.accumulatedSatang)} บาท`} />
      <Detail label="มูลค่าตามบัญชี" value={`${money(asset.bookValueSatang)} บาท`} />
      <Detail label="หมายเหตุ" value={asset.note || "—"} />
    </section>

    {asset.disposals.length > 0 && <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-gray-900">ประวัติการขาย</h2>
      <div className="mt-3 space-y-2">{asset.disposals.map((item) => <div key={item.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
        <span>{formatAccountingDate(item.saleDate)} · จำนวน {item.quantity}</span>
        <span className="font-medium">{money(toSatang(item.saleBaseAmount))} บาท</span>
      </div>)}</div>
    </section>}

    <div className="flex flex-wrap gap-3">
      <Link href="/accounting/fixed-assets" className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">กลับทะเบียนทรัพย์สิน</Link>
      <Link href={`/print/fixed-assets/label/${asset.id}`} target="_blank" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">พิมพ์ป้าย QR</Link>
    </div>
  </div>;
}

function Detail({ label, value, emphasize = false }: { label: string; value: string; emphasize?: boolean }) {
  return <div className="rounded-lg bg-gray-50 px-4 py-3">
    <p className="text-xs text-gray-500">{label}</p>
    <p className={`mt-1 text-sm ${emphasize ? "font-bold text-brand-700" : "font-medium text-gray-900"}`}>{value}</p>
  </div>;
}
