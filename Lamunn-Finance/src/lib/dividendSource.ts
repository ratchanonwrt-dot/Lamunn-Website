/** ปันผลแต่ละรายการจ่ายจากไหน — แยกให้เห็นว่าเงินสดที่ส่งกลับครัวกลางถูกเอาออกไปเท่าไหร่ เทียบกับที่ออกจากบัญชีบริษัท */
export const DIVIDEND_SOURCES = ["CASH", "BANK"] as const;
export type DividendSource = (typeof DIVIDEND_SOURCES)[number];

export const DIVIDEND_SOURCE_LABEL: Record<DividendSource, string> = {
  CASH: "เงินสด",
  BANK: "บัญชีบริษัท",
};

export function parseDividendSource(v: unknown): DividendSource | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  return DIVIDEND_SOURCES.includes(v as DividendSource) ? (v as DividendSource) : "invalid";
}
