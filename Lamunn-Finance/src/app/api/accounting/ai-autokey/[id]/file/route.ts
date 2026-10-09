import { NextResponse } from "next/server";
import { prisma } from "@lamunn/db-finance";
import { requireSectionApi } from "@/lib/permissions";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const staff = await requireSectionApi("ACCOUNTING");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const document = await prisma.accAutokeyDocument.findUnique({
    where: { id: params.id },
    include: { chunks: { orderBy: { chunkIndex: "asc" } } },
  });
  if (!document) return NextResponse.json({ error: "ไม่พบเอกสาร" }, { status: 404 });
  const file = Buffer.concat(document.chunks.map((chunk) => Buffer.from(chunk.data)));
  return new NextResponse(file, {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
