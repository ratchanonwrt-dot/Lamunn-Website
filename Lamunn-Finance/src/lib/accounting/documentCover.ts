export const DOCUMENT_COVER_TYPES = [
  { value: "INPUT_VAT", label: "รายงานภาษีซื้อ", english: "PURCHASE TAX REPORT" },
  { value: "OUTPUT_VAT", label: "รายงานภาษีขาย", english: "SALES TAX REPORT" },
  { value: "JOURNAL_VOUCHERS", label: "ใบสำคัญลงบัญชีต่างๆ", english: "ACCOUNTING VOUCHERS" },
  { value: "FIXED_ASSET_REGISTER", label: "ทะเบียนทรัพย์สิน", english: "FIXED ASSET REGISTER" },
] as const;

export type DocumentCoverType = (typeof DOCUMENT_COVER_TYPES)[number]["value"];

export function documentCoverType(value: unknown) {
  return DOCUMENT_COVER_TYPES.find((item) => item.value === value) ?? DOCUMENT_COVER_TYPES[0];
}

export function documentCoverPeriod(yearValue: unknown, monthValue: unknown, now = new Date()) {
  const parsedYear = Number(yearValue);
  const parsedMonth = Number(monthValue);
  return {
    year: Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2200 ? parsedYear : now.getUTCFullYear(),
    month: Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : now.getUTCMonth() + 1,
  };
}
