import type { InputVatRow } from "./taxReports";

export const INPUT_VAT_PRINT_HEADERS = [
  "ลำดับ",
  "วันที่",
  "เลขที่ใบกำกับ",
  "ชื่อผู้ขาย",
  "เลขผู้เสียภาษี",
  "มูลค่าสินค้า/บริการ",
  "ภาษีซื้อ",
] as const;

export interface InputVatPrintRow {
  order: number;
  date: string;
  invoiceNo: string;
  vendorName: string;
  taxId: string;
  base: number;
  vat: number;
}

function formatDate(date: Date): string {
  return [
    String(date.getUTCDate()).padStart(2, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCFullYear()),
  ].join("/");
}

/** แยกการเตรียมแถวออกจากหน้า JSX เพื่อให้พิสูจน์ได้ว่ารายงานพิมพ์ใช้เลขที่ใบกำกับและเงินหน่วยสตางค์โดยไม่แปลงเป็น float */
export function buildInputVatPrintRows(rows: InputVatRow[]): InputVatPrintRow[] {
  return rows.map((row, index) => ({
    order: index + 1,
    date: formatDate(row.date),
    invoiceNo: row.invoiceNo || "-",
    vendorName: row.branchTag ? `${row.vendorName} (${row.branchTag})` : row.vendorName,
    taxId: row.taxId ?? "-",
    base: row.base,
    vat: row.vat,
  }));
}
