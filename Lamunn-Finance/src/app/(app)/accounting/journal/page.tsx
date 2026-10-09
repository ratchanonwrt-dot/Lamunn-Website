import Link from "next/link";
import { prisma } from "@lamunn/db-finance";
import type { Prisma } from "@lamunn/db-finance";
import { requireSectionPage } from "@/lib/permissions";
import { monthRange, parseDateOnly } from "@/lib/dates";
import { formatThaiDate, thaiMonthLabel } from "@/lib/format";
import JournalEntryCard from "@/components/accounting/JournalEntryCard";
import JournalFilterBar from "@/components/accounting/JournalFilterBar";
import { fmtSatang, toSatang } from "@/lib/accounting/money";
import { getPartnerOptions } from "@/lib/accounting/refData";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  GENERAL: "รายวันทั่วไป",
  SALES: "รายวันขาย",
  PURCHASE: "รายวันซื้อ",
  RECEIPT: "รายวันรับเงิน",
  PAYMENT: "รายวันจ่ายเงิน",
  ADJUST: "ปรับปรุง",
  CLOSING: "ปิดบัญชี",
};

export default async function JournalPage({
  searchParams,
}: {
  searchParams: {
    year?: string;
    month?: string;
    accountId?: string;
    status?: string;
    page?: string;
    from?: string;
    to?: string;
    partnerId?: string;
    q?: string;
  };
}) {
  const { permissions } = await requireSectionPage("ACCOUNTING");
  const canEdit = permissions.ACCOUNTING.canEdit;

  const now = new Date();
  const year = Number(searchParams.year) || now.getUTCFullYear();
  const month = Number(searchParams.month) || now.getUTCMonth() + 1;
  const { start, end } = monthRange(year, month - 1);

  // ถ้ากรอกช่วงวันที่มา ให้ใช้ช่วงนั้นแทนทั้งเดือน (กรอกข้างเดียวก็ได้ อีกข้างเปิดไว้)
  const from = searchParams.from ? parseDateOnly(searchParams.from) : null;
  const to = searchParams.to ? parseDateOnly(searchParams.to) : null;
  const usingRange = Boolean(from || to);
  const dateFilter: Prisma.DateTimeFilter = usingRange
    ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }
    : { gte: start, lte: end };

  const q = (searchParams.q ?? "").trim();
  const partnerId = searchParams.partnerId ?? "";

  const where: Prisma.AccJournalEntryWhereInput = {
    date: dateFilter,
    ...(searchParams.status ? { status: searchParams.status as "DRAFT" | "POSTED" | "VOID" } : {}),
    // เงื่อนไขที่อิงบรรทัดต้องแยกกันคนละ some() — ถ้ารวมไว้ก้อนเดียวจะกลายเป็น
    // "มีบรรทัดเดียวที่ทั้งใช่บัญชีนี้และใช่คู่ค้านี้" ซึ่งไม่ใช่สิ่งที่ผู้ใช้ต้องการ
    ...(searchParams.accountId || partnerId
      ? {
          AND: [
            ...(searchParams.accountId ? [{ lines: { some: { accountId: searchParams.accountId } } }] : []),
            ...(partnerId ? [{ lines: { some: { partnerId } } }] : []),
          ],
        }
      : {}),
    // ค้นข้อความเดียวครอบทั้งเลขที่ใบสำคัญ คำอธิบาย ชื่อคู่ค้าในบรรทัด และหมายเหตุบรรทัด
    ...(q
      ? {
          OR: [
            { entryNo: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
            { lines: { some: { memo: { contains: q, mode: "insensitive" as const } } } },
            { lines: { some: { partner: { name: { contains: q, mode: "insensitive" as const } } } } },
          ],
        }
      : {}),
  };

  // แบ่งหน้าเสมอ — วัดแล้วที่ 1,600 ใบต่อเดือน การดึงทั้งเดือนรวดเดียวใช้เวลา ~590 ms
  // ส่วนแบ่งหน้าละ 50 ใบเหลือ ~170 ms และไม่โตตามจำนวนใบสำคัญที่สะสมขึ้นเรื่อยๆ
  const PAGE_SIZE = 50;
  const page = Math.max(1, Number(searchParams.page) || 1);

  const [entries, totalEntries, focusAccount, partners, draftCount] = await Promise.all([
    prisma.accJournalEntry.findMany({
      where,
      orderBy: [{ date: "asc" }, { entryNo: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        lines: {
          orderBy: { sortOrder: "asc" },
          include: { account: { select: { code: true, nameTh: true } }, partner: { select: { name: true } } },
        },
      },
    }),
    prisma.accJournalEntry.count({ where }),
    searchParams.accountId
      ? prisma.accAccount.findUnique({ where: { id: searchParams.accountId }, select: { code: true, nameTh: true } })
      : null,
    getPartnerOptions(),
    prisma.accJournalEntry.count({ where: { ...where, status: "DRAFT" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalEntries / PAGE_SIZE));
  const qs = (p: number) => {
    const params = new URLSearchParams({ year: String(year), month: String(month), page: String(p) });
    if (searchParams.accountId) params.set("accountId", searchParams.accountId);
    if (searchParams.status) params.set("status", searchParams.status);
    if (searchParams.from) params.set("from", searchParams.from);
    if (searchParams.to) params.set("to", searchParams.to);
    if (partnerId) params.set("partnerId", partnerId);
    if (q) params.set("q", q);
    return `/accounting/journal?${params}`;
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-bold text-gray-900">สมุดรายวัน</h1>
          <p className="text-sm text-gray-500">
            {usingRange
              ? `ใบสำคัญช่วง ${searchParams.from || "เริ่มแรก"} ถึง ${searchParams.to || "ปัจจุบัน"}`
              : `ใบสำคัญทั้งหมดของเดือน ${thaiMonthLabel(year, month - 1)}`}
            {focusAccount && (
              <>
                {" "}— กรองเฉพาะบัญชี{" "}
                <span className="font-medium text-gray-700">
                  {focusAccount.code} {focusAccount.nameTh}
                </span>{" "}
                <Link href={`/accounting/journal?year=${year}&month=${month}`} className="text-brand-700 underline">
                  ล้างตัวกรอง
                </Link>
              </>
            )}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Link
              href="/accounting/journal/ai-autokey"
              className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100"
            >
              ✦ AI Autokey
            </Link>
            <Link
              href="/accounting/journal/new"
              className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              + คีย์ใบสำคัญ
            </Link>
          </div>
        )}
      </div>

      <JournalFilterBar
        partners={partners}
        resultCount={totalEntries}
        filters={{
          year,
          month,
          from: searchParams.from ?? "",
          to: searchParams.to ?? "",
          partnerId,
          q,
          status: searchParams.status ?? "",
          accountId: searchParams.accountId ?? "",
        }}
      />

      {draftCount > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          มีใบสำคัญร่างค้างอยู่ {draftCount} ใบในเดือนนี้ — ยอดพวกนี้ยังไม่เข้างบการเงิน จนกว่าจะกดผ่านรายการ
        </div>
      )}

      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500">
          ยังไม่มีใบสำคัญในเดือนนี้
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((e) => {
            const debit = e.lines.reduce((s, l) => s + toSatang(l.debit), 0);
            return (
              <JournalEntryCard
                key={e.id}
                canEdit={canEdit}
                entry={{
                  id: e.id,
                  entryNo: e.entryNo,
                  status: e.status,
                  typeLabel: TYPE_LABELS[e.journalType],
                  dateLabel: formatThaiDate(e.date),
                  description: e.description,
                  totalLabel: fmtSatang(debit),
                }}
              >
                <table className="w-full text-sm">
                  <tbody>
                    {e.lines.map((l) => (
                      <tr key={l.id} className="border-b border-gray-50 last:border-0">
                        <td className="w-20 py-1.5 pl-4 font-mono text-xs text-gray-400">{l.account.code}</td>
                        <td className="py-1.5 text-gray-700">
                          {l.account.nameTh}
                          {l.memo && <span className="ml-2 text-xs text-gray-400">{l.memo}</span>}
                          {l.partner && <span className="ml-2 text-xs text-gray-400">· {l.partner.name}</span>}
                        </td>
                        <td className="w-32 py-1.5 text-right tabular-nums text-gray-800">{fmtSatang(toSatang(l.debit))}</td>
                        <td className="w-32 py-1.5 pr-4 text-right tabular-nums text-gray-800">{fmtSatang(toSatang(l.credit))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </JournalEntryCard>
            );
          })}

          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
              <p className="text-sm text-gray-500">
                แสดง {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalEntries)} จาก {totalEntries.toLocaleString()} ใบ
              </p>
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Link href={qs(page - 1)} prefetch={false} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
                    ← ก่อนหน้า
                  </Link>
                ) : (
                  <span className="rounded-lg border border-gray-100 px-3 py-1.5 text-sm text-gray-300">← ก่อนหน้า</span>
                )}
                <span className="text-sm text-gray-500">
                  หน้า {page} / {totalPages}
                </span>
                {page < totalPages ? (
                  <Link href={qs(page + 1)} prefetch={false} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
                    ถัดไป →
                  </Link>
                ) : (
                  <span className="rounded-lg border border-gray-100 px-3 py-1.5 text-sm text-gray-300">ถัดไป →</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
