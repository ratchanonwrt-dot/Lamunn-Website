"use client";

import { useEffect, useRef, useState } from "react";
import { formatPartnerDisplayName } from "@/lib/accounting/partnerDisplay";

interface PartnerOption {
  id: string;
  name: string;
  type: "DEBTOR" | "CREDITOR";
  phone: string | null;
  branchTag?: string | null;
}

/** ช่องเลือกคู่ค้า (ซัพพลายเออร์/ลูกหนี้) แบบพิมพ์ค้นหาได้ — โครงเดียวกับ AccountCombobox
 * ไม่บังคับเลือก มีปุ่มล้างค่าเพราะบรรทัดส่วนใหญ่ไม่มีคู่ค้าเจาะจง */
export default function PartnerCombobox({
  partners,
  value,
  onChange,
  showBranch = true,
}: {
  partners: PartnerOption[];
  value: string;
  onChange: (partnerId: string) => void;
  /** หน้าบันทึกบัญชีต้องแยกคู่ค้าชื่อเดียวกันที่อยู่คนละสาขาให้เห็นชัด */
  showBranch?: boolean;
}) {
  const selected = partners.find((p) => p.id === value) ?? null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const partnerLabel = (partner: PartnerOption) => {
    return showBranch ? formatPartnerDisplayName(partner.name, partner.branchTag) : partner.name;
  };
  const q = query.trim().toLowerCase();
  const filtered = q
    ? partners.filter((p) => partnerLabel(p).toLowerCase().includes(q) || p.phone?.includes(q))
    : partners;

  function measure() {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 240) });
  }

  function openList() {
    measure();
    setQuery("");
    setHi(0);
    setOpen(true);
  }

  function choose(p: PartnerOption | null) {
    onChange(p ? p.id : "");
    setQuery("");
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      if (listRef.current && e.target instanceof Node && listRef.current.contains(e.target)) return;
      measure();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`[data-idx="${hi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      e.preventDefault();
      openList();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[hi]) choose(filtered[hi]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        value={open ? query : selected ? partnerLabel(selected) : ""}
        placeholder={selected ? partnerLabel(selected) : "— ไม่ระบุ —"}
        onFocus={openList}
        onClick={() => !open && openList()}
        onChange={(e) => {
          setQuery(e.target.value);
          setHi(0);
          if (!open) openList();
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          setOpen(false);
          setQuery("");
        }}
        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-400"
      />
      {open && rect && (
        <div
          ref={listRef}
          style={{ position: "fixed", left: rect.left, top: rect.top, width: rect.width, zIndex: 50 }}
          className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          <button
            type="button"
            data-idx={-1}
            onMouseDown={(e) => {
              e.preventDefault();
              choose(null);
            }}
            className="block w-full px-3 py-1.5 text-left text-sm text-gray-400"
          >
            — ไม่ระบุ —
          </button>
          {filtered.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">ไม่พบคู่ค้าที่ตรงกับ “{query}”</p>}
          {filtered.map((p, idx) => (
            <button
              key={p.id}
              type="button"
              data-idx={idx}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(p);
              }}
              onMouseEnter={() => setHi(idx)}
              className={`block w-full px-3 py-1.5 text-left text-sm ${idx === hi ? "bg-brand-50 text-brand-800" : "text-gray-800"} ${
                p.id === value ? "font-semibold" : ""
              }`}
            >
              <span className={`mr-1.5 rounded px-1 py-0.5 text-[10px] font-medium ${p.type === "CREDITOR" ? "bg-rose-100 text-rose-600" : "bg-sky-100 text-sky-600"}`}>
                {p.type === "CREDITOR" ? "จ่าย" : "รับ"}
              </span>
              {partnerLabel(p)}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
