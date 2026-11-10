import Link from "next/link";
import { getBranchOptions, getEntrySuggestions, getPartnerOptions, getPostableAccounts } from "@/lib/accounting/refData";
import { requireSectionPage } from "@/lib/permissions";
import JournalEntryForm from "@/components/accounting/JournalEntryForm";

export const dynamic = "force-dynamic";

export default async function NewJournalEntryPage() {
  await requireSectionPage("ACCOUNTING", "edit");

  // ทุกรายการอ้างอิงมาจากแคชฝั่งเซิร์ฟเวอร์ (ดู refData.ts) — เปิดหน้านี้จึงแทบไม่ต้องรอฐานข้อมูล
  const [accounts, branches, allPartners, suggestions] = await Promise.all([
    getPostableAccounts(),
    getBranchOptions(),
    getPartnerOptions(),
    getEntrySuggestions(),
  ]);
  const partners = allPartners.filter((p) => p.isActive);

  // คำที่เคยพิมพ์ไว้ในใบสำคัญก่อนๆ เอามาเป็นตัวเลือกให้เลือกซ้ำได้
  const descSuggestions = suggestions.descriptions;
  const memoSuggestions = suggestions.memos;

  if (accounts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
        <p className="text-sm font-medium text-gray-700">ยังไม่มีผังบัญชี</p>
        <p className="mt-1 text-sm text-gray-500">
          ไปที่ <Link href="/accounting/accounts" className="text-brand-700 underline">ผังบัญชี</Link> เพื่อติดตั้งผังบัญชีเริ่มต้นก่อน
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-gray-900">คีย์ใบสำคัญใหม่</h1>
      <p className="mb-4 text-sm text-gray-500">
        ใช้สำหรับยอดยกมา รายการปรับปรุง หรือรายการที่ไม่ได้มาจากยอดขายรายวัน — เดบิตต้องเท่ากับเครดิตจึงจะบันทึกได้
      </p>
      <JournalEntryForm
        accounts={accounts.map((a) => ({ id: a.id, code: a.code, nameTh: a.nameTh, vatRole: a.vatRole }))}
        branches={branches}
        partners={partners}
        defaultDate={new Date().toISOString().slice(0, 10)}
        descSuggestions={descSuggestions}
        memoSuggestions={memoSuggestions}
      />
    </div>
  );
}
