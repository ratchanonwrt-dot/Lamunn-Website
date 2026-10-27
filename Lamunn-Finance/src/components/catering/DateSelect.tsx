"use client";

import { useEffect, useRef, useState } from "react";

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

function parseValue(value: string): { d: string; m: string; y: string } {
  if (!value) return { d: "", m: "", y: "" };
  const [y, m, d] = value.split("-");
  return { d: String(Number(d)), m: String(Number(m)), y };
}

// วัน/เดือน/ปี แยกเป็น 3 ช่อง (วันมาก่อนเสมอ) แทน <input type="date"> เพราะฟอร์แมตของ input
// เนทีฟขึ้นกับ locale เครื่อง/เบราว์เซอร์ผู้ใช้ คุมลำดับวัน-เดือน-ปีให้ตรงกันทุกเครื่องไม่ได้
//
// เก็บ day/month/year เป็น state ในตัวเอง แยกจาก value prop ที่ parent เห็น (ซึ่งเป็น "" จนกว่าจะ
// ครบ 3 ช่อง) — ใช้ ref เก็บค่าล่าสุดที่ตัวเองเพิ่ง emit ออกไป เพื่อแยกแยะว่า value prop ที่เปลี่ยน
// เป็นการเปลี่ยนจากภายนอกจริง (เช่น โหลดข้อมูลงานอื่นมา) หรือเป็นแค่ echo กลับมาจากการเลือกของตัวเอง
// (ไม่งั้นพอเลือกวันแล้วว่าง value="" สะท้อนกลับมา จะไปล้างวันที่เพิ่งเลือกทิ้งก่อนเลือกเดือน/ปีครบ)
export default function DateSelect({
  value,
  onChange,
  required,
  minYear,
  maxYear,
}: {
  value: string; // yyyy-mm-dd หรือ ""
  onChange: (value: string) => void;
  required?: boolean;
  minYear?: number;
  maxYear?: number;
}) {
  const [parts, setParts] = useState(() => parseValue(value));
  const lastEmitted = useRef(value);

  useEffect(() => {
    if (value !== lastEmitted.current) {
      setParts(parseValue(value));
      lastEmitted.current = value;
    }
  }, [value]);

  const now = new Date();
  const yearStart = minYear ?? now.getUTCFullYear() - 1;
  const yearEnd = maxYear ?? now.getUTCFullYear() + 3;
  const years: number[] = [];
  for (let year = yearStart; year <= yearEnd; year++) years.push(year);

  const maxDay = parts.y && parts.m ? daysInMonth(Number(parts.y), Number(parts.m)) : 31;
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);

  function update(next: { d?: string; m?: string; y?: string }) {
    const merged = { ...parts, ...next };
    setParts(merged);
    const composed =
      merged.d && merged.m && merged.y
        ? `${merged.y}-${merged.m.padStart(2, "0")}-${String(Math.min(Number(merged.d), daysInMonth(Number(merged.y), Number(merged.m)))).padStart(2, "0")}`
        : "";
    lastEmitted.current = composed;
    onChange(composed);
  }

  const selectClass =
    "rounded-lg border border-gray-300 bg-white px-2 py-2.5 text-base text-gray-900 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10";

  return (
    <div className="flex gap-1.5">
      <select
        required={required}
        value={parts.d}
        onChange={(e) => update({ d: e.target.value })}
        className={`${selectClass} w-16`}
      >
        <option value="">วัน</option>
        {days.map((dayNum) => (
          <option key={dayNum} value={dayNum}>{dayNum}</option>
        ))}
      </select>
      <select
        required={required}
        value={parts.m}
        onChange={(e) => update({ m: e.target.value })}
        className={`${selectClass} flex-1`}
      >
        <option value="">เดือน</option>
        {THAI_MONTHS.map((label, i) => (
          <option key={label} value={i + 1}>{label}</option>
        ))}
      </select>
      <select
        required={required}
        value={parts.y}
        onChange={(e) => update({ y: e.target.value })}
        className={`${selectClass} w-24`}
      >
        <option value="">ปี</option>
        {years.map((year) => (
          <option key={year} value={year}>{year}</option>
        ))}
      </select>
    </div>
  );
}
