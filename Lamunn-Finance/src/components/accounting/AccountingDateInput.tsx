"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { formatAccountingDate } from "@/lib/accounting/dateFormat";

type Props = {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: (value: string) => void;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
};

/** แสดงปี พ.ศ. ให้คนอ่าน แต่ใช้ input date โปร่งใสรับค่าจริงเพื่อไม่เปลี่ยนสัญญา API เดิม */
export default function AccountingDateInput({
  value,
  defaultValue = "",
  onChange,
  onBlur,
  name,
  required,
  disabled,
  className = "",
  ariaLabel = "เลือกวันที่",
}: Props) {
  const [localValue, setLocalValue] = useState(defaultValue);
  const isoValue = value ?? localValue;

  return (
    <span className={`relative block ${className}`}>
      <span className={`block min-h-[1.25rem] pr-8 ${disabled ? "text-gray-400" : "text-gray-900"}`}>
        {isoValue ? formatAccountingDate(isoValue) : <span className="text-gray-400">วัน/เดือน/ปี พ.ศ.</span>}
      </span>
      <input
        type="date"
        name={name}
        required={required}
        disabled={disabled}
        value={isoValue}
        aria-label={ariaLabel}
        onChange={(event) => {
          const next = event.target.value;
          if (value === undefined) setLocalValue(next);
          onChange?.(next);
        }}
        onBlur={(event) => onBlur?.(event.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <CalendarDays aria-hidden className="pointer-events-none absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
    </span>
  );
}
