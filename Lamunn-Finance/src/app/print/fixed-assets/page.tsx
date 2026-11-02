import Link from "next/link";
import { requireSectionPage } from "@/lib/permissions";
import { getAllSettings } from "@/lib/settings";
import { fmtSatang } from "@/lib/accounting/money";
import { FIXED_ASSET_CATEGORY_LABELS, loadDepreciationSchedule } from "@/lib/accounting/fixedAssets";
import PrintButton from "@/components/accounting/PrintButton";

export const dynamic = "force-dynamic";

export default async function FixedAssetPrintPage({ searchParams }: { searchParams: { year?: string; month?: string; report?: string } }) {
  await requireSectionPage("ACCOUNTING");
  const now = new Date();
  const year = Number(searchParams.year) || now.getUTCFullYear();
  const month = Number(searchParams.month) || now.getUTCMonth() + 1;
  const report = searchParams.report === "depreciation" ? "depreciation" : "register";
  const [settings, assets] = await Promise.all([getAllSettings(), loadDepreciationSchedule(year, month)]);
  const title = report === "depreciation" ? "ทะเบียนค่าเสื่อมราคาและค่าเสื่อมราคาสะสม" : "ทะเบียนทรัพย์สิน";
  return <div>
    <style>{`@page { size: A4 landscape; margin: 9mm; } @media print { html, body { background: white !important; } thead { display: table-header-group; } tr { break-inside: avoid; } }`}</style>
    <div className="mx-auto mb-4 flex max-w-[297mm] items-center justify-between print:hidden"><Link href={`/accounting/fixed-assets?year=${year}&month=${month}`} className="text-sm text-gray-500">← กลับทะเบียนทรัพย์สิน</Link><PrintButton label="พิมพ์ / บันทึก PDF" /></div>
    <main className="mx-auto min-h-[210mm] max-w-[297mm] bg-white p-6 text-black shadow print:min-h-0 print:max-w-none print:p-0 print:shadow-none">
      <header className="mb-4 text-center"><h1 className="text-lg font-bold">{settings.companyName || "ชื่อบริษัท"}</h1><h2 className="mt-1 text-base font-bold">{title}</h2><p className="text-xs">ณ วันที่ {new Date(Date.UTC(year, month, 0)).toLocaleDateString("th-TH", { timeZone: "UTC" })} · หน่วย: บาท</p></header>
      <table className="w-full border-collapse text-[9px]"><thead><tr className="bg-gray-100"><Th>รหัส</Th><Th>รายการ</Th><Th>หมวด/สาขา</Th><Th>วันที่พร้อมใช้</Th><Th align="right">จำนวน</Th><Th align="right">ราคาทุน</Th>{report === "depreciation" && <Th align="right">ค่าเสื่อมเดือนนี้</Th>}<Th align="right">ค่าเสื่อมสะสม</Th><Th align="right">มูลค่าคงเหลือ</Th><Th>สถานะ</Th></tr></thead><tbody>{assets.map((asset) => <tr key={asset.id}><Td>{asset.code}</Td><Td>{asset.name}<br/><span className="text-gray-500">{asset.invoiceNo ?? ""}</span></Td><Td>{FIXED_ASSET_CATEGORY_LABELS[asset.category]}<br/><span className="text-gray-500">{asset.branchName ?? "ไม่ระบุสาขา"}</span></Td><Td>{asset.availableDate.toLocaleDateString("th-TH", { timeZone: "UTC" })}</Td><Td align="right">{asset.remainingQuantity}/{asset.quantity}</Td><Td align="right">{fmtSatang(asset.costSatang, { zeroDash: false })}</Td>{report === "depreciation" && <Td align="right">{fmtSatang(asset.monthDepreciationSatang, { zeroDash: false })}</Td>}<Td align="right">{fmtSatang(asset.accumulatedSatang, { zeroDash: false })}</Td><Td align="right">{fmtSatang(asset.bookValueSatang, { zeroDash: false })}</Td><Td>{asset.status === "ACTIVE" ? "ใช้งาน" : "ขายแล้ว"}</Td></tr>)}</tbody><tfoot><tr className="font-bold"><Td colSpan={5}>รวม</Td><Td align="right">{fmtSatang(assets.reduce((sum, asset) => sum + asset.costSatang, 0), { zeroDash: false })}</Td>{report === "depreciation" && <Td align="right">{fmtSatang(assets.reduce((sum, asset) => sum + asset.monthDepreciationSatang, 0), { zeroDash: false })}</Td>}<Td align="right">{fmtSatang(assets.reduce((sum, asset) => sum + asset.accumulatedSatang, 0), { zeroDash: false })}</Td><Td align="right">{fmtSatang(assets.reduce((sum, asset) => sum + asset.bookValueSatang, 0), { zeroDash: false })}</Td><Td /></tr></tfoot></table>
    </main>
  </div>;
}

function Th({ children, align = "left" }: { children?: React.ReactNode; align?: "left" | "right" }) { return <th className={`border border-gray-400 px-1.5 py-1 ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>; }
function Td({ children, align = "left", colSpan }: { children?: React.ReactNode; align?: "left" | "right"; colSpan?: number }) { return <td colSpan={colSpan} className={`border border-gray-300 px-1.5 py-1 align-top ${align === "right" ? "text-right tabular-nums" : "text-left"}`}>{children}</td>; }
