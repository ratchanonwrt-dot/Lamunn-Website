/** วันที่บนหน้าจอบัญชีใช้รูปแบบเดียวกันทั้งระบบ แต่ค่าที่ส่ง API ยังคงเป็น yyyy-mm-dd ตามมาตรฐานเดิม */
export function formatAccountingDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "—";
    return `${String(value.getUTCDate()).padStart(2, "0")}/${String(value.getUTCMonth() + 1).padStart(2, "0")}/${value.getUTCFullYear()}`;
  }
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Chromium อ้างอิง lang ของช่องวันที่ในการจัดลำดับส่วนแสดงผล */
export const ACCOUNTING_DATE_INPUT_LANG = "en-GB";
