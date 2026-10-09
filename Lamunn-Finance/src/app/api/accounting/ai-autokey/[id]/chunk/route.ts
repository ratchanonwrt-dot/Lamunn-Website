import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { AUTOKEY_CHUNK_BYTES, AUTOKEY_MAX_FILE_BYTES } from "@/lib/accounting/autokey";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireSectionApi("ACCOUNTING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const document = await prisma.accAutokeyDocument.findUnique({ where: { id: params.id }, select: { id: true, status: true } });
  if (!document) return NextResponse.json({ error: "ไม่พบเอกสาร" }, { status: 404 });
  if (document.status !== "UPLOADING") return NextResponse.json({ error: "เอกสารนี้อัปโหลดเสร็จแล้ว" }, { status: 400 });
  const chunkIndex = Number(req.nextUrl.searchParams.get("index"));
  const maxChunks = Math.ceil(AUTOKEY_MAX_FILE_BYTES / AUTOKEY_CHUNK_BYTES);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= maxChunks) return NextResponse.json({ error: "ลำดับชิ้นส่วนไม่ถูกต้อง" }, { status: 400 });
  const data = Buffer.from(await req.arrayBuffer());
  if (data.length === 0 || data.length > AUTOKEY_CHUNK_BYTES) return NextResponse.json({ error: "ชิ้นส่วนไฟล์ต้องไม่เกิน 3 MB" }, { status: 400 });
  await prisma.accAutokeyFileChunk.upsert({
    where: { documentId_chunkIndex: { documentId: params.id, chunkIndex } },
    create: { documentId: params.id, chunkIndex, data },
    update: { data },
  });
  return NextResponse.json({ ok: true, chunkIndex });
}
