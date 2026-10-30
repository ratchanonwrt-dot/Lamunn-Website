// พิสูจน์ว่า verifyQrPayload ของระบบใบกำกับภาษียอมรับ QR ใบเสร็จจริงจาก POS
// (POS เซ็นยอดเงินเป็นข้อความ "278.00" — ถ้าแปลงเป็นตัวเลขก่อนเซ็นจะได้ "278" แล้วไม่ผ่านทุกใบ)
// อ่านอย่างเดียว: ดึง QR ล่าสุดที่ CRM ตรวจผ่านแล้วจาก lamunn_crm.qr_scan_logs มาตรวจซ้ำ
// รัน: node --env-file=../Lamunn-CRM/.env --import tsx scripts/verify-qr-signature.ts
// ใช้ Prisma client ของ CRM (root) — client ของแอปนี้ผูกกับฐานข้อมูลใบกำกับภาษี ไม่ใช่ lamunn_crm
import { PrismaClient } from "../../node_modules/@prisma/client";
import { verifyQrPayload, buildSignedQrContent } from "../src/lib/qr";

let failed = 0;
function check(label: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
}

async function main() {
  const secret = process.env.POS_QR_SECRET ?? "";
  if (!secret) throw new Error("POS_QR_SECRET not set");

  // ตัวสร้าง QR ของเราเองต้องไปกลับได้ ทั้งยอดที่ส่งเป็นตัวเลขและเป็นข้อความ
  const asNumber = buildSignedQrContent({ scanBaseUrl: "https://x/r", branchCode: "PARAGON", receiptNo: "T-1", amount: 278 }, secret);
  check("buildSignedQrContent(278) prints a=278.00 and verifies", asNumber.includes("a=278.00") && verifyQrPayload(asNumber, { secret, validHours: 72 }).ok);
  const asText = buildSignedQrContent({ scanBaseUrl: "https://x/r", branchCode: "PARAGON", receiptNo: "T-2", amount: "89.00" }, secret);
  check('buildSignedQrContent("89.00") verifies', verifyQrPayload(asText, { secret, validHours: 72 }).ok);

  // QR ใบเสร็จจริงที่ CRM ตรวจลายเซ็นผ่าน — ระบบใบกำกับต้องผ่านด้วย (ไม่สนอายุ QR ในการทดสอบนี้)
  const prisma = new PrismaClient();
  try {
    const logs = await prisma.$queryRawUnsafe<{ rawPayload: string }[]>(
      `SELECT "rawPayload" FROM lamunn_crm.qr_scan_logs WHERE result = 'SUCCESS' AND "signatureValid" = true ORDER BY "createdAt" DESC LIMIT 20`
    );
    check(`found real signed receipt QRs (${logs.length})`, logs.length > 0);
    const results = logs.map((l) => verifyQrPayload(l.rawPayload, { secret, validHours: 24 * 365 * 10 }));
    const okCount = results.filter((r) => r.ok && r.signed).length;
    check(`real receipt QRs accepted as signed: ${okCount}/${logs.length}`, okCount === logs.length);
    const forged = logs[0].rawPayload.replace(/([?&]a=)[^&]+/, "$11.00");
    check("tampered amount is rejected", !verifyQrPayload(forged, { secret, validHours: 24 * 365 * 10 }).ok);
  } finally {
    await prisma.$disconnect();
  }

  if (failed) {
    console.log(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nall checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
