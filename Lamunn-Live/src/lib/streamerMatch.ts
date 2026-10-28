/** เบอร์แบบเทียบกันได้: เหลือแต่ตัวเลข และ +66 / 66 นำหน้า → 0 */
export function phoneKey(v: string | null | undefined): string {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("66") ? `0${d.slice(2)}` : d;
}

const nameKey = (v: string | null | undefined) => (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export interface MatchStreamer {
  id: string;
  name: string;
  phone: string | null;
  lineId: string | null;
}

export type MatchReason = "history" | "phone" | "line" | "name";

/**
 * หาคนไลฟ์ที่มีอยู่แล้วสำหรับคำขอจอง — เดิมเทียบแค่เบอร์ แต่คนไลฟ์เก่าหลายคนไม่มีเบอร์ในหลังบ้าน
 * ระบบเลยเสนอ "สร้างคนไลฟ์ใหม่" ให้คนที่เคยไลฟ์แล้ว ลำดับความมั่นใจ:
 *   1. เบอร์นี้เคยถูกอนุมัติแล้วผูกกับคนไลฟ์คนไหน (history: เบอร์ → คนไลฟ์)
 *   2. เบอร์ตรงกัน  3. LINE ID ตรงกัน
 *   4. ชื่อตรงกัน หรือชื่อหนึ่งขึ้นต้นด้วยอีกชื่อ ("รสา สมสอาด" ↔ "รสา") — เฉพาะเมื่อเจอคนเดียว กันจับผิดคน
 */
export function matchStreamer(
  req: { requesterPhone: string; requesterLine: string | null; requesterName: string },
  streamers: MatchStreamer[],
  history: Map<string, string>,
): { streamer: MatchStreamer; reason: MatchReason } | null {
  const key = phoneKey(req.requesterPhone);
  const fromHistory = key ? history.get(key) : undefined;
  const h = fromHistory ? streamers.find((s) => s.id === fromHistory) : undefined;
  if (h) return { streamer: h, reason: "history" };
  const byPhone = key ? streamers.find((s) => phoneKey(s.phone) === key) : undefined;
  if (byPhone) return { streamer: byPhone, reason: "phone" };
  const line = nameKey(req.requesterLine);
  const byLine = line ? streamers.find((s) => nameKey(s.lineId) === line) : undefined;
  if (byLine) return { streamer: byLine, reason: "line" };
  const n = nameKey(req.requesterName);
  if (!n) return null;
  const exact = streamers.filter((s) => nameKey(s.name) === n);
  if (exact.length === 1) return { streamer: exact[0], reason: "name" };
  if (exact.length > 1) return null;
  const prefix = streamers.filter((s) => {
    const sn = nameKey(s.name);
    return sn && (n.startsWith(`${sn} `) || sn.startsWith(`${n} `));
  });
  return prefix.length === 1 ? { streamer: prefix[0], reason: "name" } : null;
}
