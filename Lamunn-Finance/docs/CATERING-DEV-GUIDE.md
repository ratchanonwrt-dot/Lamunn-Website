# คู่มือพัฒนาระบบ Catering ด้วย Codex (สำหรับทีม Catering)

คุณพัฒนา "ระบบ Catering" ในเว็บ Lamunn-Finance (เมนู Catering: งานจัดเลี้ยง, ปฏิทิน, ลูกค้า, เมนู, ออเดอร์รับเอง,
พนักงาน catering) ผ่าน Codex บนเครื่องของคุณเอง แล้วส่งงานเป็น Pull Request
ระบบจะตรวจอัตโนมัติว่าแตะ**เฉพาะไฟล์ของระบบ catering** (ดูหัวข้อ "ทีม Catering — ขอบเขตการแก้ไข" ใน `AGENTS.md`)
และโค้ดคอมไพล์ผ่าน — ผ่านแล้วกด merge เอง เว็บจริงอัปเดตเองภายในไม่กี่นาที

## A. ติดตั้งครั้งแรก (ทำครั้งเดียว)

1. ติดตั้ง **Git** (git-scm.com), **Node.js 20 LTS** (nodejs.org), **VS Code** (code.visualstudio.com)
2. รับคำเชิญเข้า repo จากอีเมล GitHub ก่อน แล้วเปิด VS Code → Terminal (กด Ctrl + `) พิมพ์:
   ```bash
   git clone https://github.com/ratchanonwrt-dot/Lamunn-Website.git
   cd Lamunn-Website
   npm install
   ```
3. วางไฟล์ `.env` ที่เจ้าของระบบส่งให้ ไว้ที่ `Lamunn-Website/Lamunn-Finance/.env` (ชื่อไฟล์ต้อง `.env` เป๊ะ)
   (**เป็นฐานข้อมูล dev เท่านั้น — ไม่ใช่ข้อมูลจริง** ทดสอบอะไรก็ไม่กระทบเว็บจริง)
4. ติดตั้ง Codex: VS Code → Extensions → ค้น "Codex" (OpenAI) → Install → Sign in ด้วยบัญชี ChatGPT
5. เปิดโฟลเดอร์ `Lamunn-Website` ใน VS Code — Codex จะอ่านกติกาจาก `AGENTS.md` ที่ root ของ repo เอง
6. ทดสอบว่ารันได้:
   ```bash
   cd Lamunn-Finance
   npm run dev
   ```
   เปิด http://localhost:3003 ล็อกอินด้วยบัญชี dev ที่เจ้าของระบบให้ แล้วเห็นเมนู "Catering" = พร้อมใช้งาน

## B. เริ่มงานใหม่ทุกครั้ง

```bash
git checkout master
git pull
git checkout -b cat/ชื่องาน-สั้นๆ
```
ตัวอย่างชื่อ branch: `cat/booking-print-quote`, `cat/fix-staff-ot-total` — **ต้องขึ้นต้นด้วย `cat/` เสมอ**

## C. สั่งงาน Codex

พิมพ์ภาษาไทยธรรมดาในช่องแชทของ Codex ได้เลย ตัวอย่าง:

- **เพิ่มฟังก์ชัน** — "หน้ารายละเอียดงานจัดเลี้ยง เพิ่มปุ่มพิมพ์ใบเสนอราคาให้ลูกค้า"
- **แก้วิธีทำงาน** — "ตอนเลือกพนักงานไปงาน ให้ซ่อนคนที่ลางานวันนั้นไปเลย ไม่ใช่แค่ขึ้นป้าย"
- **แก้บั๊ก** — "ยอด OT รวมในหน้าพนักงาน catering ไม่ตรงกับผลรวมรายคน หาสาเหตุใน `src/lib/cateringStaffPay.ts`
  แล้วแก้ พร้อมเทสพิสูจน์"
- **ถามก่อนแก้** (แนะนำสำหรับงานใหญ่) — "อธิบายว่าการคิดค่าเดินทางและเบี้ยเลี้ยงพนักงาน catering ทำงานยังไง
  ยังไม่ต้องแก้"
- **ปิดท้ายทุกงาน** — "รัน `npx tsc --noEmit` ให้ผ่าน แล้วสรุปว่าแก้ไฟล์อะไรบ้าง"

## D. ส่งงาน

```bash
git add -A
git commit -m "สรุปสั้นๆ ว่าทำอะไร"
git push -u origin HEAD
```
เปิดลิงก์ที่ git แสดง → **Create pull request** → รอเครื่องหมายถูกสีเขียว (ตรวจขอบเขตไฟล์ + tsc)
→ กด **Merge** → ระบบ deploy ขึ้นเว็บจริงให้เอง

## กติกา 3 ข้อ

1. **ห้ามทำงานบน `master` ตรงๆ** — สร้าง branch `cat/...` ใหม่ทุกงาน
2. **ถ้าเครื่องหมายแดง** บอกว่าแตะไฟล์นอกระบบ catering (เช่นเมนูซ้าย, ระบบบัญชี, หน้าการเงิน) → ไม่ต้องพยายามแก้ให้ผ่าน
   ส่งลิงก์ PR ให้เจ้าของระบบดู หรือให้ Codex คืนค่าไฟล์นั้น: `git checkout master -- <ไฟล์นั้น>`
3. **ข้อมูลทดสอบใช้วันที่ปี ค.ศ. 2090 ขึ้นไป** และสคริปต์ต้องลบเฉพาะที่ตัวเองสร้าง — ห้ามลบด้วยเงื่อนไขกว้างๆ

## ถ้าเจอปัญหา

| อาการ | ทำอย่างไร |
|---|---|
| `npm run dev` ขึ้น error เรื่อง Prisma client | ให้ Codex รัน `npx prisma generate --schema ../packages/db-finance/prisma/schema.prisma` จากโฟลเดอร์ Lamunn-Finance |
| ล็อกอินไม่ได้ | เช็คว่าเปิด `localhost:3003` (ไม่ใช่เว็บจริง) และไฟล์ `.env` วางถูกที่ — แล้วรีสตาร์ท `npm run dev` |
| PR ตกที่ขั้น tsc | ให้ Codex รัน `npx tsc --noEmit` แล้วแก้ตาม error |
| PR ตกที่ขั้น accounting-scope | มีไฟล์นอกระบบ catering ถูกแก้ — คืนค่าไฟล์นั้น หรือส่งให้เจ้าของระบบดู |
