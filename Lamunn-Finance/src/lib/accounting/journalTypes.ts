import type { AccJournalType } from "@lamunn/db-finance";

export const JOURNAL_TYPE_OPTIONS: ReadonlyArray<{ value: AccJournalType; label: string }> = [
  { value: "GENERAL", label: "สมุดรายวันทั่วไป" },
  { value: "SALES", label: "สมุดรายวันขาย" },
  { value: "PURCHASE", label: "สมุดรายวันซื้อ" },
  { value: "RECEIPT", label: "สมุดรายวันรับเงิน" },
  { value: "PAYMENT", label: "สมุดรายวันจ่ายเงิน" },
  { value: "ADJUST", label: "ใบสำคัญปรับปรุง" },
  { value: "CLOSING", label: "รายการปิดบัญชี" },
];

export const JOURNAL_TYPE_LABELS = Object.fromEntries(
  JOURNAL_TYPE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<AccJournalType, string>;

export function isJournalType(value: string | undefined): value is AccJournalType {
  return JOURNAL_TYPE_OPTIONS.some((option) => option.value === value);
}
