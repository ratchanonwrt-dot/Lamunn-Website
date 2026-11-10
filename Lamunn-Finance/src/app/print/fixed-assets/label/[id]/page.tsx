import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { headers } from "next/headers";
import { prisma } from "@lamunn/db-finance";
import { requireSectionPage } from "@/lib/permissions";
import PrintButton from "@/components/accounting/PrintButton";
import { fixedAssetDetailUrl } from "@/lib/accounting/fixedAssets";

export const dynamic = "force-dynamic";

export default async function FixedAssetLabelPage({ params }: { params: { id: string } }) {
  await requireSectionPage("ACCOUNTING");
  const asset = await prisma.accFixedAsset.findUnique({ where: { id: params.id } });
  if (!asset) return <p className="p-6">ไม่พบทรัพย์สิน</p>;
  const requestHeaders = headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() || (process.env.NODE_ENV === "production" ? "https" : "http");
  const origin = process.env.NEXTAUTH_URL || (host ? `${protocol}://${host}` : "http://localhost:3003");
  const qr = await QRCode.toDataURL(fixedAssetDetailUrl(origin, asset.id), { margin: 1, width: 320, errorCorrectionLevel: "M" });
  return <div>
    <style>{`@page { size: A4; margin: 10mm; } @media print { html, body { background:white !important; } }`}</style>
    <div className="mx-auto mb-4 flex max-w-[190mm] items-center justify-between print:hidden"><Link href="/accounting/fixed-assets" className="text-sm text-gray-500">← กลับทะเบียนทรัพย์สิน</Link><PrintButton label="พิมพ์ป้าย"/></div>
    <main className="mx-auto grid min-h-[277mm] max-w-[190mm] place-items-start bg-white p-8 text-black shadow print:min-h-0 print:max-w-none print:p-0 print:shadow-none">
      <section className="grid w-[90mm] grid-cols-[34mm_1fr] items-center gap-4 rounded-lg border-2 border-black p-3">
        <Image src={qr} alt={`QR ${asset.code}`} width={320} height={320} unoptimized className="h-[32mm] w-[32mm]"/>
        <div><h1 className="text-sm font-bold">{asset.code}</h1><p className="mt-1 text-[10px] font-semibold">{asset.name}</p></div>
      </section>
    </main>
  </div>;
}
