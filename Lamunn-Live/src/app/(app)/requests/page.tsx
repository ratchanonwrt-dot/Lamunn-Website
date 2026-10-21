import { prisma } from "@lamunn/db-live";
import { requirePageRole } from "@/lib/requirePageRole";
import RequestsManager from "@/components/RequestsManager";

export const dynamic = "force-dynamic";

export default async function RequestsPage({ searchParams }: { searchParams: { status?: string } }) {
  await requirePageRole();
  const status = (["PENDING", "APPROVED", "REJECTED", "CANCELLED", "ALL"].includes(searchParams.status ?? "") ? searchParams.status : "PENDING") as "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "ALL";

  const [requests, streamers, counts] = await Promise.all([
    prisma.slotRequest.findMany({
      where: status === "ALL" ? {} : { status },
      include: { channel: true, streamer: true, reviewedByStaff: { select: { name: true } } },
      orderBy: status === "PENDING" ? [{ date: "asc" }, { startTime: "asc" }] : [{ updatedAt: "desc" }],
      take: 200,
    }),
    prisma.streamer.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, phone: true, lineId: true } }),
    prisma.slotRequest.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-semibold tracking-tight text-ink">คำขอจองกะจากเว็บจอง</h1>
      <p className="mb-5 text-sm text-muted">
        คนที่ขอมาจากเว็บจองจะมารอที่นี่ — ช่วงเดียวกันขอซ้อนกันได้ แอดมินเลือกว่าใครได้ไลฟ์ (คำขอที่ทับกันจะถูกปฏิเสธอัตโนมัติเมื่ออนุมัติคนหนึ่ง) อนุมัติแล้วระบบจะสร้างกะในตารางไลฟ์ให้ทันที (จับคู่คนไลฟ์จากเบอร์โทรอัตโนมัติ ถ้าไม่เจอให้เลือกเองหรือสร้างคนใหม่)
      </p>
      <RequestsManager
        status={status}
        counts={{ PENDING: countOf("PENDING"), APPROVED: countOf("APPROVED"), REJECTED: countOf("REJECTED"), CANCELLED: countOf("CANCELLED") }}
        streamers={streamers}
        requests={requests.map((r) => ({
          id: r.id,
          date: r.date.toISOString().slice(0, 10),
          startTime: r.startTime,
          endTime: r.endTime,
          channelId: r.channelId,
          channelName: r.channel?.name ?? null,
          requesterName: r.requesterName,
          requesterPhone: r.requesterPhone,
          requesterLine: r.requesterLine,
          note: r.note,
          isReturning: r.isReturning,
          status: r.status,
          streamerName: r.streamer?.name ?? null,
          shiftId: r.shiftId,
          replacesShiftId: r.replacesShiftId,
          reviewNote: r.reviewNote,
          reviewedBy: r.reviewedByStaff?.name ?? null,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
