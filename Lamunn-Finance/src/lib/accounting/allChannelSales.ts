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

export const ALL_CHANNEL_SALES_SUMMARY_COLUMNS = ["ลำดับ", "สาขา", "มูลค่าก่อนภาษี", "ภาษี 7%", "มูลค่ารวมภาษี"] as const;
export const ALL_CHANNEL_SALES_POS_COLUMNS = ["ลำดับ", "ช่องทาง", "สาขา", "มูลค่ารวมภาษี"] as const;
export const ALL_CHANNEL_SALES_CASH_FIXED_COLUMNS = ["ลำดับ", "รายการ"] as const;
export const ALL_CHANNEL_SALES_CASH_BRANCHES = [
  "อโศก",
  "บรรทัดทอง",
  "Embassy (Tops)",
  "ลาดพร้าว (Tops)",
  "นอร์ธ วิล (Tops)",
  "ปิ่นเกล้า",
  "พระราม 2",
  "พระราม 3",
  "พระราม 9(Tops)",
  "รามอินทรา",
  "เวสเกต",
  "คลาวด์ 11",
  "วิลเลจ บางนา",
  "Emporium",
  "EmQuartier",
  "แฟชั่น",
  "ฟิวเจอร์ พาร์ค",
  "แฮปปี้เทท",
  "IconSiam",
  "Nirvana Porch",
  "One Bangkok",
  "Park Silom",
  "ราชพฤกษ์",
  "เตาปูน",
  "บางแค",
  "บางกะปิ",
  "งามวงศ์วาน",
  "รามคำแหง",
  "ท่าพระ",
  "Cartering และอื่นๆ",
  "TIKTOK",
  "วางบิล TOPS",
  "วางบิล The mall",
] as const;

export const ALL_CHANNEL_SALES_LINKS = {
  taxInvoices: "/accounting/tax-invoices",
  summary: "/accounting/all-channel-sales?sheet=summary",
} as const;

export type AllChannelSalesSheetKey = (typeof ALL_CHANNEL_SALES_SHEETS)[number]["key"];

/** ลิงก์อาจถูกพิมพ์เอง จึงคืนแท็บสรุปแทนการปล่อยให้หน้าไม่มีแท็บที่เลือก */
export function resolveAllChannelSalesSheet(value: string | undefined) {
  return ALL_CHANNEL_SALES_SHEETS.find((sheet) => sheet.key === value) ?? ALL_CHANNEL_SALES_SHEETS[0];
}
