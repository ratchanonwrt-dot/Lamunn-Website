"use client";

import { useEffect, useRef, useState } from "react";

interface AccountOption {
  id: string;
  code: string;
  nameTh: string;
}

/** ช่องเลือกบัญชีแบบพิมพ์ค้นหาได้ — พิมพ์รหัสหรือชื่อบัญชีแล้วรายการจะกรองให้ทันที
 * dropdown ใช้ position:fixed เพราะตารางใบสำคัญอยู่ใน overflow-x-auto ซึ่งจะตัด dropdown แบบ absolute ทิ้ง */
export default function AccountCombobox({
  accounts,
  value,
  onChange,
  placeholder = "— เลือกบัญชี —",
  disabled = false,
}: {
  accounts: AccountOption[];
  value: string;
  onChange: (accountId: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const selected = accounts.find((a) => a.id === value) ?? null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const label = (a: AccountOption) => `${a.code} ${a.nameTh}`;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? accounts.filter((a) => a.code.toLowerCase().startsWith(q) || a.nameTh.toLowerCase().includes(q) || label(a).toLowerCase().includes(q))
    : accounts;

  function measure() {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 280) });
  }

  function openList() {
    measure();
    setQuery("");
    setHi(0);
    setOpen(true);
  }

  function choose(a: AccountOption) {
    onChange(a.id);
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
        disabled={disabled}
        value={open ? query : selected ? label(selected) : ""}
        placeholder={selected ? label(selected) : placeholder}
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
        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-400"
      />
      {open && rect && (
        <div
          ref={listRef}
          style={{ position: "fixed", left: rect.left, top: rect.top, width: rect.width, zIndex: 50 }}
          className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {filtered.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">ไม่พบบัญชีที่ตรงกับ “{query}”</p>}
          {filtered.map((a, idx) => (
            <button
              key={a.id}
              type="button"
              data-idx={idx}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(a);
              }}
              onMouseEnter={() => setHi(idx)}
              className={`block w-full px-3 py-1.5 text-left text-sm ${
                idx === hi ? "bg-brand-50 text-brand-800" : "text-gray-800"
              } ${a.id === value ? "font-semibold" : ""}`}
            >
              <span className="mr-2 font-mono text-xs text-gray-500">{a.code}</span>
              {a.nameTh}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
