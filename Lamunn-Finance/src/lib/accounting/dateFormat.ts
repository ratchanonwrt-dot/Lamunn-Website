/** วันที่บนหน้าจอบัญชีใช้ วัน/เดือน/ปี พ.ศ. โดยค่าที่ส่ง API ยังคงเป็น yyyy-mm-dd ตามมาตรฐานเดิม */
export function formatAccountingDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "—";
    return `${value.getUTCDate()}/${value.getUTCMonth() + 1}/${value.getUTCFullYear() + 543}`;
  }
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  return `${Number(match[3])}/${Number(match[2])}/${Number(match[1]) + 543}`;
}
