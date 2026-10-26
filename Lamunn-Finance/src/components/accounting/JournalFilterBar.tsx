"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import PartnerCombobox from "./PartnerCombobox";
import { thaiMonthLabel } from "@/lib/format";
import { JOURNAL_TYPE_OPTIONS } from "@/lib/accounting/journalTypes";

interface PartnerOption {
  id: string;
  name: string;
  type: "DEBTOR" | "CREDITOR";
  phone: string | null;
}

export interface JournalFilters {
  year: number;
  month: number;
  /** ช่วงวันที่เจาะจง — ถ้าใส่ จะใช้แทนการดูทั้งเดือน */
  from: string;
  to: string;
  partnerId: string;
  journalType: string;
  q: string;
  status: string;
  accountId: string;
}

/** แถบค้นหาของสมุดรายวัน — เลื่อนเดือน, เจาะช่วงวันที่, กรองตามซัพพลายเออร์, ค้นข้อความ
 *
 * ทุกตัวกรองเก็บใน query string ทั้งหมด กดย้อนกลับ/บุ๊กมาร์ก/ส่งลิงก์ให้คนอื่นแล้วได้ผลเดิม
 * (ไม่ใช้ MonthFilterBar ตัวกลาง เพราะตัวนั้นต่อ "?year=" ทับ query string เดิมทิ้ง)
 *
 * การเปลี่ยนตัวกรองวิ่งผ่าน useTransition เพื่อให้แถบรู้ว่ากำลังโหลดและโชว์ให้เห็น —
 * แถบโหลดกลางของเว็บ (NavigationProgress) จับเฉพาะคลิกลิงก์ ไม่จับ router.push จากช่องเลือก
 * ก่อนหน้านี้เปลี่ยนตัวกรองแล้วจอนิ่งไปเป็นวินาทีโดยไม่มีอะไรบอกว่ากำลังทำงาน */
export default function JournalFilterBar({
  filters,
  partners,
  resultCount,
}: {
  filters: JournalFilters;
  partners: PartnerOption[];
  resultCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q);

  useEffect(() => {
    setQ(filters.q);
  }, [filters.q]);

  function go(next: Partial<JournalFilters>) {
    const merged = { ...filters, ...next };
    const params = new URLSearchParams();
    params.set("year", String(merged.year));
    params.set("month", String(merged.month));
    if (merged.from) params.set("from", merged.from);
    if (merged.to) params.set("to", merged.to);
    if (merged.partnerId) params.set("partnerId", merged.partnerId);
    if (merged.journalType) params.set("journalType", merged.journalType);
    if (merged.q.trim()) params.set("q", merged.q.trim());
    if (merged.status) params.set("status", merged.status);
    if (merged.accountId) params.set("accountId", merged.accountId);
    startTransition(() => router.push(`/accounting/journal?${params}`));
  }

  const usingRange = Boolean(filters.from || filters.to);
  const hasAnyFilter = usingRange || filters.partnerId || filters.journalType || filters.q || filters.status || filters.accountId;

  const prevMonth = () => (filters.month === 1 ? go({ year: filters.year - 1, month: 12 }) : go({ month: filters.month - 1 }));
  const nextMonth = () => (filters.month === 12 ? go({ year: filters.year + 1, month: 1 }) : go({ month: filters.month + 1 }));

  const field = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900";
  const label = "block text-xs text-gray-500";

  return (
    <div aria-busy={pending} className={`mb-4 rounded-xl border border-gray-200 bg-white p-4 transition-opacity ${pending ? "opacity-70" : ""}`}>
      {/* แถวบน: เลื่อนเดือน + ค้นข้อความ */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={prevMonth} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
            ← เดือนก่อน
          </button>
          <span className={`min-w-[9rem] text-center text-sm font-semibold ${usingRange ? "text-gray-400 line-through" : "text-gray-800"}`}>
            {thaiMonthLabel(filters.year, filters.month - 1)}
          </span>
          <button type="button" onClick={nextMonth} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
            เดือนถัดไป →
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            go({ q });
          }}
          className="relative min-w-[16rem] flex-1"
        >
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาเลขที่ใบสำคัญ / คำอธิบาย / ชื่อซัพพลายเออร์  แล้วกด Enter"
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-9 text-sm text-gray-900"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                go({ q: "" });
              }}
              aria-label="ล้างคำค้น"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100"
            >
              <X size={14} />
            </button>
          )}
        </form>
      </div>

      {/* แถวล่าง: ช่วงวันที่ + ประเภทสมุด + ซัพพลายเออร์ + สถานะ */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <span className={label}>วันที่ลงบัญชี ตั้งแต่</span>
          <DateField value={filters.from} onCommit={(from) => go({ from })} className={`mt-1 ${field}`} />
        </div>
        <div>
          <span className={label}>ถึงวันที่</span>
          <DateField value={filters.to} onCommit={(to) => go({ to })} className={`mt-1 ${field}`} />
        </div>
        <div>
          <span className={label}>ประเภทสมุดรายวัน</span>
          <select value={filters.journalType} onChange={(e) => go({ journalType: e.target.value })} className={`mt-1 ${field}`}>
            <option value="">ทุกประเภท</option>
            {JOURNAL_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>ซัพพลายเออร์ / คู่ค้า</span>
          <div className="mt-1">
            <PartnerCombobox partners={partners} value={filters.partnerId} onChange={(id) => go({ partnerId: id })} />
          </div>
        </div>
        <div>
          <span className={label}>สถานะ</span>
          <select value={filters.status} onChange={(e) => go({ status: e.target.value })} className={`mt-1 ${field}`}>
            <option value="">ทุกสถานะ</option>
            <option value="DRAFT">ร่าง</option>
            <option value="POSTED">ผ่านรายการแล้ว</option>
            <option value="VOID">ยกเลิก</option>
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {pending ? (
          <span className="flex items-center gap-1.5 text-brand-700">
            <Loader2 size={14} className="animate-spin" /> กำลังค้นหา...
          </span>
        ) : (
          <span className="text-gray-500">
            พบ {resultCount.toLocaleString("th-TH")} ใบสำคัญ
            {usingRange && <span className="ml-1 text-gray-400">(ใช้ช่วงวันที่ที่เลือก ไม่ใช่ทั้งเดือน)</span>}
          </span>
        )}
        {hasAnyFilter && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              startTransition(() => router.push(`/accounting/journal?year=${filters.year}&month=${filters.month}`));
            }}
            className="text-gray-500 underline hover:text-gray-700"
          >
            ล้างตัวกรองทั้งหมด
          </button>
        )}
      </div>
    </div>
  );
}

/** ช่องวันที่ที่ไม่ยิงค้นหาระหว่างพิมพ์ครึ่งๆ กลางๆ
 *
 * <input type="date"> ยิง onChange ทุกครั้งที่ตัวเลขครบเป็นวันที่ — ตอนพิมพ์ปี "2569" ทีละหลัก
 * จะได้ค่า 0002-.., 0020-.., 0202-.. ก่อนถึงค่าจริง ของเดิมเลยค้นหาซ้ำ 4 รอบต่อการพิมพ์วันเดียว
 * ตรงนี้จะส่งค่าออกเมื่อปีดูเป็นปีจริงแล้ว (เลือกจากปฏิทินก็เข้าเงื่อนไขนี้ทันที)
 * ส่วนการล้างค่าเป็นช่องว่างจะรอจนออกจากช่องหรือกด Enter เพราะระหว่างพิมพ์เบราว์เซอร์ก็ส่ง "" มาเหมือนกัน */
function DateField({ value, onCommit, className }: { value: string; onCommit: (v: string) => void; className: string }) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const commit = (v: string) => {
    if (v !== value) onCommit(v);
  };

  return (
    <input
      type="date"
      value={local}
      onChange={(e) => {
        const v = e.target.value;
        setLocal(v);
        if (v && Number(v.slice(0, 4)) >= 1900) commit(v);
      }}
      onBlur={() => commit(local)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(local);
      }}
      className={className}
    />
  );
}
