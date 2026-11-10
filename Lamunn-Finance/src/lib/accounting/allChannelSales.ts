export const ALL_CHANNEL_SALES_SHEETS = [
  { key: "summary", label: "สรุปยอดขาย" },
  { key: "pos", label: "POS" },
  { key: "cash", label: "Cash" },
  { key: "grab", label: "Grab" },
  { key: "line-man", label: "Line man" },
  { key: "credit-card", label: "credit card" },
  { key: "e-wallet", label: "E-wallet" },
  { key: "kshop-qr-edc", label: "KSHOP_QR EDC" },
  { key: "the-mall", label: "The mall" },
  { key: "tops", label: "Tops" },
  { key: "catering-other", label: "Cateringและอื่นๆ" },
  { key: "tiktok", label: "Tiktok" },
] as const;

export type AllChannelSalesSheetKey = (typeof ALL_CHANNEL_SALES_SHEETS)[number]["key"];

/** ลิงก์อาจถูกพิมพ์เอง จึงคืนแท็บสรุปแทนการปล่อยให้หน้าไม่มีแท็บที่เลือก */
export function resolveAllChannelSalesSheet(value: string | undefined) {
  return ALL_CHANNEL_SALES_SHEETS.find((sheet) => sheet.key === value) ?? ALL_CHANNEL_SALES_SHEETS[0];
}
