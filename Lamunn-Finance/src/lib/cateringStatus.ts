/** สถานะงานจัดเลี้ยงแบบ "ป้ายเดียว" ใช้ร่วมกันทุกหน้า Catering ให้สีหมายถึงสิ่งเดียวกันเสมอ
 *
 * เดิมแต่ละหน้าแสดงสถานะการชำระกับสถานะการจองแยกเป็น 2 ป้ายคนละสี อ่านยากว่างานนี้ "ต้องทำอะไรต่อ"
 * ตอนนี้ยุบเหลือป้ายเดียวที่บอกเรื่องสำคัญที่สุดก่อน: ยกเลิก > จบงาน > เลยกำหนดจ่าย > จ่ายเต็ม > มัดจำ > จอง */

export type BookingTone = "cancelled" | "done" | "overdue" | "paid" | "deposit" | "booked";

// สีทึบ (ไม่ใช่สีพาสเทล) เพื่อให้แยกสถานะออกได้ในแวบเดียว — ผู้ใช้บอกว่าสีอ่อนแยกกันไม่ออกบนจอร้าน
// date = กล่องวันที่ในการ์ดงาน ทาสีตามสถานะ ให้ไล่สายตาลงรายการแล้วเห็นสีก่อนอ่านตัวหนังสือ
export const TONE: Record<BookingTone, { label: string; badge: string; dot: string; card: string; soft: string; date: string }> = {
  booked: { label: "จอง", badge: "bg-amber-400 text-amber-950", dot: "bg-amber-400", card: "border-l-amber-400", soft: "bg-amber-100 border-amber-300 text-amber-950", date: "bg-amber-400 text-amber-950" },
  deposit: { label: "มัดจำแล้ว", badge: "bg-sky-600 text-white", dot: "bg-sky-600", card: "border-l-sky-600", soft: "bg-sky-100 border-sky-300 text-sky-950", date: "bg-sky-600 text-white" },
  paid: { label: "จ่ายเต็มแล้ว", badge: "bg-emerald-600 text-white", dot: "bg-emerald-600", card: "border-l-emerald-600", soft: "bg-emerald-100 border-emerald-300 text-emerald-950", date: "bg-emerald-600 text-white" },
  overdue: { label: "เลยกำหนดจ่าย", badge: "bg-red-600 text-white", dot: "bg-red-600", card: "border-l-red-600", soft: "bg-red-100 border-red-300 text-red-950", date: "bg-red-600 text-white" },
  done: { label: "จบงานแล้ว", badge: "bg-gray-300 text-gray-800", dot: "bg-gray-400", card: "border-l-gray-300", soft: "bg-gray-100 border-gray-300 text-gray-700", date: "bg-gray-200 text-gray-700" },
  cancelled: { label: "ยกเลิก", badge: "bg-gray-200 text-gray-500 line-through", dot: "bg-gray-300", card: "border-l-gray-200", soft: "bg-gray-50 border-gray-200 text-gray-400 line-through", date: "bg-gray-100 text-gray-400" },
};

/** วันนี้ตามเวลาไทย (UTC-midnight ของวันไทย) — ไฟล์นี้ใช้ได้ทั้งฝั่ง client จึงไม่ import จาก cateringCalendar ที่ผูก prisma */
export function todayBkk() {
  const n = new Date(Date.now() + 7 * 3600e3);
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

export function bookingTone(b: { paymentStatus: string; status: string; paymentDueDate?: Date | string | null }, today: Date = todayBkk()): BookingTone {
  if (b.status === "CANCELLED") return "cancelled";
  if (b.status === "COMPLETED") return "done";
  const due = b.paymentDueDate ? new Date(b.paymentDueDate) : null;
  if (b.paymentStatus !== "FULLY_PAID" && due && due < today) return "overdue";
  if (b.paymentStatus === "FULLY_PAID") return "paid";
  if (b.paymentStatus === "DEPOSIT_PAID") return "deposit";
  return "booked";
}

export const CHANNEL_LABEL: Record<string, string> = {
  LINE: "LINE",
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  PHONE: "โทร",
  REFERRAL: "คนแนะนำ",
  WALK_IN: "Walk-in",
  GOOGLE: "Google",
  OTHER: "อื่นๆ",
};

export const CHANNEL_COLOR: Record<string, string> = {
  LINE: "bg-green-100 text-green-700",
  FACEBOOK: "bg-blue-100 text-blue-700",
  INSTAGRAM: "bg-pink-100 text-pink-700",
  TIKTOK: "bg-gray-900 text-white",
  PHONE: "bg-violet-100 text-violet-700",
  REFERRAL: "bg-orange-100 text-orange-700",
  WALK_IN: "bg-teal-100 text-teal-700",
  GOOGLE: "bg-yellow-100 text-yellow-800",
  OTHER: "bg-gray-100 text-gray-600",
};

const DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "ส. 5 ต.ค." — วันที่แบบสั้นอ่านเร็ว ใช้ในรายการงาน */
export function shortThaiDate(d: Date) {
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

/** อีกกี่วันถึงวันงาน — "วันนี้", "พรุ่งนี้", "อีก 5 วัน", "ผ่านมา 2 วัน" */
export function daysAway(d: Date, today: Date) {
  const n = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (n === 0) return "วันนี้";
  if (n === 1) return "พรุ่งนี้";
  if (n > 0) return `อีก ${n} วัน`;
  return `ผ่านมา ${-n} วัน`;
}
