import { NextResponse } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { analyzeAccountingDocument } from "@/lib/accounting/autokey";

export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const staff = await requireSectionApi("ACCOUNTING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const document = await prisma.accAutokeyDocument.findUnique({
    where: { id: params.id },
    include: { chunks: { orderBy: { chunkIndex: "asc" } } },
  });
  if (!document) return NextResponse.json({ error: "ไม่พบเอกสาร" }, { status: 404 });
  if (document.entryId) return NextResponse.json({ error: "เอกสารนี้สร้างใบสำคัญแล้ว" }, { status: 409 });
  const file = Buffer.concat(document.chunks.map((chunk) => Buffer.from(chunk.data)));
  if (file.length !== document.fileSize) return NextResponse.json({ error: "ไฟล์อัปโหลดยังไม่ครบ กรุณาลองใหม่" }, { status: 400 });

  await prisma.accAutokeyDocument.update({ where: { id: document.id }, data: { status: "ANALYZING", errorMessage: null } });
  try {
    const result = await analyzeAccountingDocument(file, document.mimeType);
    await prisma.accAutokeyDocument.update({ where: { id: document.id }, data: { status: "REVIEW", extractedData: result } });
    return NextResponse.json({ documentId: document.id, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "อ่านเอกสารไม่สำเร็จ";
    await prisma.accAutokeyDocument.update({ where: { id: document.id }, data: { status: "FAILED", errorMessage: message } });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
