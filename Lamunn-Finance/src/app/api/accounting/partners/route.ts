import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { revalidateAccountingRef, ACC_PARTNERS_TAG } from "@/lib/accounting/refData";

export async function GET() {
  const staff = await requireSectionApi("ACCOUNTING", "view");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const partners = await prisma.accPartner.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ partners });
}

export async function POST(req: NextRequest) {
  const staff = await requireSectionApi("ACCOUNTING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { name, type, phone, taxId, branchTag, address, note } = await req.json();
  if (!name || !type) return NextResponse.json({ error: "กรอกชื่อและประเภท (ลูกหนี้/เจ้าหนี้) ให้ครบ" }, { status: 400 });
  if (!["DEBTOR", "CREDITOR"].includes(type)) return NextResponse.json({ error: "ประเภทไม่ถูกต้อง" }, { status: 400 });

  const partner = await prisma.accPartner.create({
    data: {
      name: String(name).trim(),
      type,
      phone: phone || null,
      taxId: taxId || null,
      branchTag: String(branchTag ?? "").trim() || null,
      address: address || null,
      note: note || null,
    },
  });
  revalidateAccountingRef(ACC_PARTNERS_TAG);
  return NextResponse.json({ partner });
}
