import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { AccountingError } from "@/lib/accounting/post";
import { updateWhtCertificateDetails } from "@/lib/accounting/whtCertificateEdit";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireSectionApi("ACCOUNTING", "view");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const certificate = await prisma.accWhtCertificate.findUnique({ where: { id: params.id } });
  if (!certificate) return NextResponse.json({ error: "ไม่พบหนังสือรับรองนี้" }, { status: 404 });
  return NextResponse.json({ certificate: { ...certificate, payDate: certificate.payDate.toISOString().slice(0, 10), baseAmount: Number(certificate.baseAmount), whtAmount: Number(certificate.whtAmount) } });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireSectionApi("ACCOUNTING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const certificate = await updateWhtCertificateDetails(params.id, await req.json());
    return NextResponse.json({ certificate });
  } catch (error) {
    if (error instanceof AccountingError) return NextResponse.json({ error: error.message }, { status: error.message === "ไม่พบหนังสือรับรองนี้" ? 404 : 400 });
    throw error;
  }
}

/** ยกเลิกหนังสือรับรองหัก ณ ที่จ่าย — ไม่ลบทิ้ง เพราะเลขที่ต้องรันต่อเนื่องและตรวจย้อนหลังได้ */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireSectionApi("ACCOUNTING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { action } = await req.json();
  if (action !== "void") return NextResponse.json({ error: "action ต้องเป็น void" }, { status: 400 });

  const cert = await prisma.accWhtCertificate.update({ where: { id: params.id }, data: { voided: true } });
  return NextResponse.json({ cert });
}
