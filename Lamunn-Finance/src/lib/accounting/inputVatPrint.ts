import type { InputVatRow } from "./taxReports";
import { formatPartnerDisplayName } from "./partnerDisplay";
import { formatAccountingDate } from "./dateFormat";

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

/** แยกการเตรียมแถวออกจากหน้า JSX เพื่อให้พิสูจน์ได้ว่ารายงานพิมพ์ใช้เลขที่ใบกำกับและเงินหน่วยสตางค์โดยไม่แปลงเป็น float */
export function buildInputVatPrintRows(rows: InputVatRow[]): InputVatPrintRow[] {
  return rows.map((row, index) => ({
    order: index + 1,
    date: formatAccountingDate(row.date),
    invoiceNo: row.invoiceNo || "-",
    vendorName: formatPartnerDisplayName(row.vendorName, row.branchTag),
    taxId: row.taxId ?? "-",
    base: row.base,
    vat: row.vat,
  }));
}
