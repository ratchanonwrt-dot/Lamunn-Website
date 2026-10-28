import { prisma } from "@lamunn/db-live";

/** เบอร์แบบเทียบกันได้: เหลือแต่ตัวเลข และ +66 / 66 นำหน้า → 0 (คนไลฟ์บางคนพิมพ์แบบสากล บางคนพิมพ์มีขีด) */
export function phoneKey(v: string | null | undefined): string {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("66") ? `0${d.slice(2)}` : d;
}

/**
 * คนไลฟ์ (ในหลังบ้าน) ที่เป็นเจ้าของเบอร์นี้ — ใช้ติดป้าย "ของฉัน" ให้กะที่ไม่ได้มาจากคำขอบนเว็บ
 * (แอดมินลงกะเองในตาราง หรือลบแล้วลงใหม่ ทำให้กะไม่ผูกกับคำขอ — เดิมคนไลฟ์เลยเห็นกะตัวเองเป็น "มีคนไลฟ์แล้ว")
 * ดูจาก 2 ทาง: เบอร์ในข้อมูลคนไลฟ์ตรงกัน หรือเคยถูกอนุมัติคำขอจากเบอร์นี้แล้วผูกกับคนไลฟ์คนนั้น
 * (คนไลฟ์เก่าหลายคนไม่มีเบอร์ในหลังบ้าน ทางที่ 2 จึงจำเป็น)
 */
export async function myStreamerIds(phone: string): Promise<Set<string>> {
  const key = phoneKey(phone);
  const [streamers, linked] = await Promise.all([
    prisma.streamer.findMany({ where: { phone: { not: null } }, select: { id: true, phone: true } }),
    prisma.slotRequest.findMany({ where: { requesterPhone: phone, status: "APPROVED", streamerId: { not: null } }, select: { streamerId: true }, distinct: ["streamerId"] }),
  ]);
  const ids = new Set<string>();
  for (const s of streamers) if (key && phoneKey(s.phone) === key) ids.add(s.id);
  for (const r of linked) if (r.streamerId) ids.add(r.streamerId);
  return ids;
}
