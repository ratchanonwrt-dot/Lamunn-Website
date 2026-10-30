/** ชื่อประเภทเงินได้ในข้อมูลยังเก็บมาตราไว้เพื่อใช้จำแนกภาษี แต่แบบ 50 ทวิข้อ 6 มีหัวข้อ “อื่น ๆ” อยู่แล้วจึงไม่ควรพิมพ์มาตราซ้ำ */
export function formatWhtOtherIncomeType(incomeType: string) {
  return incomeType.replace(/\s*ม\.\s*40\s*\(\s*8\s*\)\s*$/u, "").trim();
}
