"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { Loader2, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

export default function InputVatVendorSearch({ initialQuery, resultCount, totalCount }: { initialQuery: string; resultCount: number; totalCount: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [searching, startSearching] = useTransition();

  useEffect(() => setQuery(initialQuery), [initialQuery]);

  function apply(nextQuery: string) {
    const params = new URLSearchParams(searchParams.toString());
    const cleanQuery = nextQuery.trim().slice(0, 100);
    if (cleanQuery) params.set("q", cleanQuery);
    else params.delete("q");
    startSearching(() => router.replace(`/accounting/tax-reports/input-vat?${params.toString()}`));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    apply(query);
  }

  return (
    <form onSubmit={submit} className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
      <div className="relative min-w-[260px] flex-1">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ค้นหาชื่อผู้ขาย เลขผู้เสียภาษี หรือสาขา"
          className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-9 text-sm text-gray-900 outline-none focus:border-brand-400"
        />
        {query && (
          <button type="button" onClick={() => { setQuery(""); apply(""); }} aria-label="ล้างคำค้น" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X size={15} />
          </button>
        )}
      </div>
      <button type="submit" disabled={searching} className="flex h-10 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white disabled:opacity-60">
        {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} ค้นหา
      </button>
      <span className="text-xs text-gray-500">พบ {resultCount} จาก {totalCount} รายการ</span>
    </form>
  );
}
