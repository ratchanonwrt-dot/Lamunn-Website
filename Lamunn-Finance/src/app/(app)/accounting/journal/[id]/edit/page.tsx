import Link from "next/link";
import { prisma } from "@lamunn/db-finance";
import { getBranchOptions, getEntrySuggestions, getPartnerOptions, getPostableAccounts } from "@/lib/accounting/refData";
import { requireSectionPage } from "@/lib/permissions";
import JournalEntryForm from "@/components/accounting/JournalEntryForm";

export const dynamic = "force-dynamic";

export default async function EditJournalEntryPage({ params }: { params: { id: string } }) {
  await requireSectionPage("ACCOUNTING", "edit");

  const [entry, accounts, branches, partners, suggestions] = await Promise.all([
    prisma.accJournalEntry.findUnique({
      where: { id: params.id },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    }),
    getPostableAccounts(),
    getBranchOptions(),
    getPartnerOptions().then((all) => all.filter((p) => p.isActive)),
    getEntrySuggestions(),
  ]);

  if (!entry) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
        <p className="text-sm font-medium text-gray-700">ไม่พบใบสำคัญนี้</p>
        <Link href="/accounting/journal" className="mt-1 inline-block text-sm text-brand-700 underline">
          กลับไปสมุดรายวัน
        </Link>
      </div>
    );
  }

  if (entry.status !== "DRAFT") {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
        <p className="text-sm font-medium text-gray-700">
          ใบสำคัญ {entry.entryNo} {entry.status === "POSTED" ? "ผ่านรายการแล้ว" : "ถูกยกเลิกแล้ว"} — แก้ไขไม่ได้
        </p>
        <p className="mt-1 text-sm text-gray-500">แก้ไขได้เฉพาะใบสำคัญที่ยังเป็นร่าง ถ้าต้องแก้ยอด ให้ยกเลิกใบนี้แล้วคีย์ใหม่แทน</p>
        <Link href="/accounting/journal" className="mt-3 inline-block text-sm text-brand-700 underline">
          กลับไปสมุดรายวัน
        </Link>
      </div>
    );
  }

  const descSuggestions = suggestions.descriptions;
  const memoSuggestions = suggestions.memos;

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-gray-900">แก้ไขใบสำคัญร่าง {entry.entryNo}</h1>
      <p className="mb-4 text-sm text-gray-500">แก้แล้วยังเป็นร่างเหมือนเดิม จนกว่าจะกดผ่านรายการ — เดบิตต้องเท่ากับเครดิตจึงจะบันทึกได้</p>
      <JournalEntryForm
        mode="edit"
        entryId={entry.id}
        accounts={accounts.map((a) => ({ id: a.id, code: a.code, nameTh: a.nameTh, vatRole: a.vatRole }))}
        branches={branches}
        partners={partners}
        defaultDate={entry.date.toISOString().slice(0, 10)}
        descSuggestions={descSuggestions}
        memoSuggestions={memoSuggestions}
        initial={{
          date: entry.date.toISOString().slice(0, 10),
          journalType: entry.journalType,
          description: entry.description,
          lines: entry.lines.map((l) => ({
            accountId: l.accountId,
            debit: Number(l.debit) ? String(Number(l.debit)) : "",
            credit: Number(l.credit) ? String(Number(l.credit)) : "",
            branchId: l.branchId ?? "",
            partnerId: l.partnerId ?? "",
            memo: l.memo ?? "",
            docNo: l.docNo ?? "",
          })),
        }}
      />
    </div>
  );
}
