import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";
import { AUTOKEY_MAX_FILE_BYTES, AUTOKEY_MIME_TYPES } from "@/lib/accounting/autokey";

export async function POST(req: NextRequest) {
  const staff = await requireSectionApi("ACCOUNTING", "edit");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { fileName, mimeType, fileSize, fileHash } = await req.json();
  if (!fileName || !AUTOKEY_MIME_TYPES.includes(mimeType) || !Number.isInteger(fileSize) || fileSize <= 0 || fileSize > AUTOKEY_MAX_FILE_BYTES) {
    return NextResponse.json({ error: "รองรับ PDF, JPG, PNG ขนาดไม่เกิน 50 MB" }, { status: 400 });
  }
  if (!/^[a-f0-9]{64}$/i.test(fileHash || "")) return NextResponse.json({ error: "file hash ไม่ถูกต้อง" }, { status: 400 });

  const existing = await prisma.accAutokeyDocument.findUnique({
    where: { fileHash },
    include: { drafts: { orderBy: { pageNumber: "asc" } } },
  });
  if (existing) {
    if (existing.drafts.length > 0) {
      return NextResponse.json({
        documentId: existing.id,
        resumed: true,
        results: existing.drafts.map((draft) => ({
          ...(draft.extractedData as object),
          draftId: draft.id,
          entryId: draft.entryId,
        })),
      });
    }
    if (!existing.entryId) {
      // ถ้า AI เคยล้มเหลวหรือเน็ตขาด ผู้ใช้ต้องอัปโหลดไฟล์เดิมซ้ำได้ ไม่เช่นนั้น hash เดิมจะล็อกเอกสารถาวร
      await prisma.$transaction([
        prisma.accAutokeyFileChunk.deleteMany({ where: { documentId: existing.id } }),
        prisma.accAutokeyDocument.update({
          where: { id: existing.id },
          data: { status: "UPLOADING", errorMessage: null, extractedData: Prisma.DbNull, fileName: String(fileName).slice(0, 255), mimeType, fileSize, createdBy: staff.staffId },
        }),
      ]);
      return NextResponse.json({ documentId: existing.id, resumed: true });
    }
    return NextResponse.json({
      error: "ไฟล์นี้เคยสร้างใบสำคัญแล้ว",
      documentId: existing.id,
      duplicate: true,
    }, { status: 409 });
  }

  const document = await prisma.accAutokeyDocument.create({
    data: { fileName: String(fileName).slice(0, 255), mimeType, fileSize, fileHash: fileHash.toLowerCase(), createdBy: staff.staffId },
  });
  return NextResponse.json({ documentId: document.id });
}
