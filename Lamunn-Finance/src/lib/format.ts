export function formatBaht(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function formatPercent(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return `${(n * 100).toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`;
}

export function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const thaiMonths = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

export function thaiMonthLabel(year: number, monthIndex0: number): string {
  return `${thaiMonths[monthIndex0]} ${year + 543}`;
}

export function formatThaiDate(d: Date): string {
  return `${d.getUTCDate()} ${thaiMonths[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`;
}

// ป้ายกำกับสถานะสำหรับ Function เสริม Catering
export const paymentStatusLabel: Record<string, string> = {
  UNPAID: "ยังไม่ชำระ",
  DEPOSIT_PAID: "มัดจำแล้ว",
  FULLY_PAID: "ชำระครบแล้ว",
};

export const bookingStatusLabel: Record<string, string> = {
  PENDING: "รอยืนยัน",
  CONFIRMED: "ยืนยันแล้ว",
  COMPLETED: "จบงานแล้ว",
  CANCELLED: "ยกเลิก",
};

export const pickupStatusLabel: Record<string, string> = {
  PENDING: "รอเตรียมของ",
  READY: "พร้อมให้รับ",
  COMPLETED: "รับของแล้ว",
  CANCELLED: "ยกเลิก",
};

export const customerSourceLabel: Record<string, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  LINE: "Line",
  REFERRAL: "คนแนะนำ/บอกต่อ",
  WALK_IN: "เดินเข้ามาเอง",
  GOOGLE: "Google",
  PHONE: "โทรศัพท์",
  TIKTOK: "TikTok",
  OTHER: "อื่นๆ",
};

/** สถานะการชำระของ "งานจัดเลี้ยง" ตามภาษาที่ทีม Catering ใช้ (จอง / มัดจำแล้ว / จ่ายเต็ม)
 * แยกจาก paymentStatusLabel ที่ออเดอร์รับหน้าร้านใช้ร่วมกัน */
export const bookingPaymentLabel: Record<string, string> = {
  UNPAID: "จอง (ยังไม่จ่าย)",
  DEPOSIT_PAID: "มัดจำแล้ว",
  FULLY_PAID: "จ่ายเต็มแล้ว",
};
