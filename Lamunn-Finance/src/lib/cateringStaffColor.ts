/** สีประจำตัวพนักงาน Catering — ให้เห็นว่าใครเป็นใครในแวบเดียว (แถบสี + จุดสี)
 *
 * class ของ Tailwind ต้องเขียนเป็นสตริงเต็มๆ ตรงนี้ (สร้างจากชื่อสีต่อกันไม่ได้ ไม่งั้น Tailwind ตัดทิ้งตอน build) */

export interface StaffColor {
  bar: string; // แถบสีเข้ม (แถบซ้ายของการ์ด / แท่งกราฟ)
  soft: string; // พื้นอ่อน + ตัวหนังสือเข้ม (ป้ายชื่อ)
  dot: string;
}

const PALETTE: StaffColor[] = [
  { bar: "bg-rose-500", soft: "bg-rose-50 text-rose-800 ring-rose-200", dot: "bg-rose-500" },
  { bar: "bg-sky-500", soft: "bg-sky-50 text-sky-800 ring-sky-200", dot: "bg-sky-500" },
  { bar: "bg-emerald-500", soft: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500" },
  { bar: "bg-amber-500", soft: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  { bar: "bg-violet-500", soft: "bg-violet-50 text-violet-800 ring-violet-200", dot: "bg-violet-500" },
  { bar: "bg-teal-500", soft: "bg-teal-50 text-teal-800 ring-teal-200", dot: "bg-teal-500" },
  { bar: "bg-orange-500", soft: "bg-orange-50 text-orange-800 ring-orange-200", dot: "bg-orange-500" },
  { bar: "bg-fuchsia-500", soft: "bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-200", dot: "bg-fuchsia-500" },
  { bar: "bg-lime-500", soft: "bg-lime-50 text-lime-800 ring-lime-200", dot: "bg-lime-500" },
  { bar: "bg-cyan-500", soft: "bg-cyan-50 text-cyan-800 ring-cyan-200", dot: "bg-cyan-500" },
  { bar: "bg-indigo-500", soft: "bg-indigo-50 text-indigo-800 ring-indigo-200", dot: "bg-indigo-500" },
  { bar: "bg-pink-500", soft: "bg-pink-50 text-pink-800 ring-pink-200", dot: "bg-pink-500" },
];

const key = (name: string) => name.trim().toLowerCase();

function hashIndex(name: string): number {
  let h = 0;
  for (const ch of key(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % PALETTE.length;
}

/** สร้างตัวหา "สีของชื่อนี้" — คนในรายชื่อได้สีตามลำดับที่เพิ่มเข้าระบบ (createdAt) จึงไม่ซ้ำกันจนกว่าจะเกิน 12 คน
 * และไม่เปลี่ยนเมื่อมีคนถูกปิดใช้งาน/เพิ่มคนใหม่ทีหลัง; ชื่อนอกรายชื่อใช้สีจาก hash ของชื่อ (คงที่ทุกครั้ง) */
export function makeStaffColorLookup(roster: { name: string; createdAt: Date }[]): (name: string) => StaffColor {
  const order = [...roster].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.name.localeCompare(b.name));
  const idx = new Map(order.map((r, i) => [key(r.name), i]));
  return (name: string) => {
    const i = idx.get(key(name));
    return PALETTE[i !== undefined ? i % PALETTE.length : hashIndex(name)];
  };
}
