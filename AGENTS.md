# AGENTS.md — กติกาสำหรับ AI agent (Codex) ของทีมพัฒนาใน repo นี้

repo นี้เป็น monorepo ของธุรกิจร้านอาหาร/เบเกอรี่ Lamunn มีหลายแอป (CRM, Finance, Catering, Live ฯลฯ)
มีหลายทีมใช้ repo เดียวกัน **แต่ละทีมแก้ได้คนละขอบเขต** — ข้อความเปิดงานของผู้สั่งงานจะบอกว่าคุณอยู่ทีมไหน
ถ้าไม่แน่ใจให้ถามก่อนแก้ไฟล์ใดๆ

## ใครแก้อะไรได้

| ทีม | branch | แก้ได้ | รายละเอียด |
|---|---|---|---|
| ทีมบัญชี | `acc/*` | ทั้งแอป `Lamunn-Finance` **ยกเว้น** หน้าการเงินที่เจ้าของสงวนไว้ | หัวข้อ "ทีมบัญชี — ขอบเขตการแก้ไข" |
| ทีม Catering | `cat/*` | **เฉพาะ** ระบบ catering ใน `Lamunn-Finance` (+ แอปเก่า `Lamunn-Catering`) | หัวข้อ "ทีม Catering — ขอบเขตการแก้ไข" |

CI (`accounting-scope`) ตรวจตามบัญชี GitHub ของคนเปิด PR — แตะไฟล์นอกขอบเขตทีมตัวเองเมื่อไร PR จะ merge ไม่ได้
จนกว่าเจ้าของ repo จะตรวจเอง (ทะเบียนทีมอยู่ใน `.github/scripts/check_scope.py` ซึ่งทุกทีมห้ามแก้)

## ระบบคืออะไร

`Lamunn-Finance` เป็นเว็บ Next.js 14 (App Router) + Prisma 5 + PostgreSQL (Supabase) ข้างในมี 2 ส่วนที่คนละทีมดูแล:

- **การเงิน** — ยอดขายรายวัน, ค่าเช่า, credit term, เงินฝาก, catering ฯลฯ → แก้ได้บางส่วน **ยกเว้นหน้าที่เจ้าของสงวนไว้ (ห้ามแตะ — ดูตารางด้านล่าง)**
- **บัญชี** — ระบบบัญชีคู่แบบโปรแกรม Express: ผังบัญชี, สมุดรายวัน/ใบสำคัญ, งบทดลอง, งบกำไรขาดทุน,
  งบแสดงฐานะการเงิน, บัญชีแยกประเภท, ใบกำกับภาษีเต็มรูป, รายงานภาษีซื้อ/ขาย, ภ.พ.30, ภ.ง.ด.3/53, คู่ค้า → **นี่คืองานของคุณ**

## ทีมบัญชี — ขอบเขตการแก้ไข (แก้ได้ทุกอย่าง ยกเว้น "ส่วนที่ห้ามแตะ" ด้านล่าง)

ทีมบัญชีแก้ได้ทั้งแอป Lamunn-Finance (รวมเมนูซ้าย, หน้าตั้งค่า, ค่าเช่า, เงินฝาก, catering, staff ฯลฯ)
และ merge + deploy ได้เองเมื่อ CI ผ่าน **ยกเว้น** หน้าการเงินที่เจ้าของดูแลเอง ซึ่งห้ามแตะ:

| ส่วนที่ห้ามแตะ | ไฟล์ |
|---|---|
| สถานะการเงินบริษัท | `src/app/(app)/company-status/**`, `src/app/api/company-status/**`, `api/company-channel/**`, `api/dividend-payments/**`, `src/components/CompanyStatusLive.tsx` |
| รายงานวิเคราะห์ (รวมอันดับสาขา, SSSG, ยอดขายรายสาขา) | `src/app/(app)/reports/**`, `src/app/api/export/**`, `src/lib/reportsCalc.ts`, `sssgCalc.ts`, `exportXlsx.ts`, `src/components/charts/**`, `ExportPanel`, `RankingFilterBar`, `BranchSalesFilterBar` |
| ยอดขายรายวัน / รายเดือน | `src/app/(app)/monthly/**`, `src/app/api/daily-sales/**`, `src/components/BranchDailyMatrix`, `EditableMonthlyChannelTable`, `BackgroundSync` |
| Credit term / วางบิล | `src/app/(app)/credit-term/**`, `src/app/api/credit-term/**`, `api/billing-groups/**`, `api/branch-billing/**`, `api/gp-rate-history/**`, `src/lib/creditTermCalc.ts`, `billingCalc.ts`, `billingPdf.tsx`, `gpRateHistory.ts`, `rentCalc.ts`, `src/components/CreditTerm*`, `*CreditTerm*`, `BranchBilling*`, `BillingGroupSettings` |
| สถานะเงินสด | `src/app/(app)/cash-status/**`, `src/app/api/cash-adjustments/**`, `src/components/AddCashAdjustmentForm`, `DeleteCashAdjustmentButton` |
| ภาพรวม (dashboard) | `src/app/(app)/dashboard/**`, `src/lib/finance.ts` |
| ค่าใช้จ่ายลงทุน | `src/app/(app)/investment-cost/**`, `src/app/api/investment-costs/**`, `src/components/AddInvestmentCostForm`, `DeleteInvestmentCostButton`, `InvestmentResaleCell` |
| CI / สิทธิ์ | `.github/**` |
| ฐานข้อมูล | `packages/db-finance/prisma/schema.prisma` แก้ได้เฉพาะ model/enum ที่ขึ้นต้นด้วย `Acc*`, migration ใหม่แตะได้เฉพาะตาราง `acc_*` |

ถ้างานจำเป็นต้องแตะส่วนที่ห้าม ให้หยุดแล้วบอกผู้สั่งงานก่อนว่าทำไม — CI (`accounting-scope`) จะปฏิเสธ PR นั้น
และต้องให้เจ้าของ repo ตรวจแล้ว merge เอง (รายการใน CI ต้องตรงกับตารางนี้เสมอ: `.github/scripts/check_scope.py`)

ไฟล์ที่ใช้ร่วมกันแต่**แก้ได้** เช่น `src/components/Nav.tsx` (เมนูซ้าย), `src/lib/permissions.ts`, `src/app/(app)/layout.tsx`
— แก้ได้แต่ต้องระวังไม่ให้หน้าการเงินที่ห้ามแตะเสียหาย และรัน `tsc` ให้ผ่านทุกครั้ง

## ทีม Catering — ขอบเขตการแก้ไข (แก้ได้เฉพาะรายการนี้)

ระบบ catering คือหน้าเมนู "Catering" ในเว็บ Lamunn-Finance: งานจัดเลี้ยง (booking), ปฏิทิน, ลูกค้า, เมนู/แพ็กเกจ,
ออเดอร์รับเอง (pickup order), พนักงาน catering / ค่าเดินทาง / OT / เบี้ยเลี้ยง

| แก้ได้ | ไฟล์ |
|---|---|
| หน้าจอ | `Lamunn-Finance/src/app/(app)/catering/**` |
| API | `Lamunn-Finance/src/app/api/catering/**` (ตรวจสิทธิ์ด้วย `requireSectionApi("CATERING", ...)`) |
| คอมโพเนนต์ | `Lamunn-Finance/src/components/catering/**` |
| ตรรกะคำนวณ | `Lamunn-Finance/src/lib/catering*.ts` (`cateringBookingDays`, `cateringCalendar`, `cateringItemsTotal`, `cateringStaffPay`, `cateringStatus`), `pickupOrderItemsTotal.ts` |
| สคริปต์ทดสอบ / เอกสาร | `Lamunn-Finance/scripts/verify-catering*.ts`, `Lamunn-Finance/docs/CATERING*.md` |
| แอปเก่า | `Lamunn-Catering/**` (แอปแยกที่เลิกใช้แล้ว — ปกติไม่ต้องแตะ) |
| ฐานข้อมูล | `schema.prisma` เฉพาะ model/enum `Catering*`, `PickupOrder*`, `Customer*` · migration ใหม่เฉพาะตาราง `catering_*`, `pickup_order*`, `customers` |

**ทุกอย่างนอกรายการนี้ห้ามแก้** — รวมถึงเมนูซ้าย (`src/components/Nav.tsx`), สิทธิ์ (`src/lib/permissions.ts`),
layout, ระบบบัญชี และหน้าการเงินทั้งหมด ถ้างานต้องแตะไฟล์พวกนั้น (เช่นเพิ่มเมนูใหม่ในแถบซ้าย) ให้หยุดแล้วบอก
ผู้สั่งงานว่าต้องให้เจ้าของ repo ทำส่วนนั้น — ทำส่วนที่อยู่ในขอบเขตให้เสร็จ แล้วระบุไว้ในคำอธิบาย PR

## หลักการที่ระบบยึด — ทีมบัญชี (ห้ามทำผิด)

1. ทุกรายการบัญชีต้องผ่าน `src/lib/accounting/post.ts` เท่านั้น (`createEntry` / `postEntry` / `unpostEntry` /
   `voidEntry` / `restoreEntry` / `updateEntry`) ห้ามเขียน `AccJournalEntry` / `AccJournalLine` ด้วย prisma ตรงๆ
2. เดบิตต้องเท่ากับเครดิตเสมอ และงวดที่ปิดแล้ว (`AccPeriod.status = CLOSED`) ห้ามแก้
3. เงินเก็บเป็น**สตางค์ (integer)** ในโค้ด ใช้ helper ใน `src/lib/accounting/money.ts` (`toSatang` / `toBaht` /
   `splitVatInclusive` / `addVatExclusive`) ห้ามคำนวณเงินด้วย float — ในฐานข้อมูลเป็น `Decimal(15,2)`
4. `AccJournalLine` มี `date` และ `status` ซ้ำจากหัวใบโดยตั้งใจ (เพื่อให้คิวรีงบเร็ว) — ถ้าเปลี่ยนสถานะหรือวันที่
   ใบสำคัญ ต้องอัปเดตที่บรรทัดด้วยเสมอ (ดูวิธีใน `post.ts`)
5. ยอดขายรายวันลงบัญชีครั้งเดียว (`dailySales.ts`) ใบกำกับภาษีเต็มรูปที่ `deductFromBulk = true` ห้ามลงรายได้ซ้ำ
   — นี่คือปัญหาหลักที่ระบบนี้ถูกสร้างมาแก้ (FlowAccount นับรายได้ซ้ำ)
6. รายงานภาษีซื้อใช้เลขที่ใบกำกับจาก `docNo` ที่**บรรทัด** ไม่ใช่เลขที่ใบสำคัญ — ใบสำคัญใบเดียวมีใบกำกับหลายใบได้
   และต้องแสดงแยกแถวทุกใบ (`journalTaxLines.ts`)
7. รายการอ้างอิง (ผังบัญชี / คู่ค้า / สาขา / คำที่เคยพิมพ์) แคชไว้ใน `src/lib/accounting/refData.ts` —
   API ที่แก้ข้อมูลพวกนี้ต้องเรียก `revalidateAccountingRef(tag)` หลังเขียนเสร็จ ไม่งั้นหน้าจอจะเห็นข้อมูลเก่า
8. ปุ่มทุกปุ่มใช้ `useServerRefresh()` จาก `src/components/accounting/useServerRefresh.ts` และอัปเดตหน้าจอทันที
   ที่ API ตอบ (optimistic) ไม่ให้ผู้ใช้รอโหลดหน้าซ้ำ — ดูตัวอย่างใน `EntryActions.tsx`, `PartnerList.tsx`
9. ตัวกรองทุกตัวเก็บใน query string (กดย้อนกลับ/บุ๊กมาร์กได้) และวิ่งผ่าน `useTransition` เพื่อโชว์สถานะกำลังโหลด
   — ดู `JournalFilterBar.tsx`

## หลักการที่ระบบยึด — ทีม Catering

1. ยอดเงินของงาน (ค่าอาหาร / ค่าส่ง / มัดจำ / ยอดคงเหลือ) คำนวณจากฟังก์ชันใน `src/lib/catering*.ts` ที่เดียว
   — หน้าจอและ API ห้ามคำนวณซ้ำเอง ไม่งั้นตัวเลขสองที่จะไม่ตรงกัน
2. สถานะงาน/การชำระเงินเปลี่ยนผ่าน API ที่มีอยู่ (`confirm-payment`, `cateringStatus.ts`) ไม่เขียนสถานะตรงๆ จากหน้าจอ
3. ข้อมูลพนักงานและค่าแรง (OT, ค่าเดินทาง, เบี้ยเลี้ยง) อ่านจาก `cateringStaffPay.ts` — ถ้าเปลี่ยนสูตรต้องมี verify script
4. ใช้รูปแบบปุ่ม/ฟอร์มเดียวกับที่มีอยู่ใน `src/components/catering/` (อัปเดตหน้าจอทันทีที่ API ตอบ ไม่รอโหลดหน้าซ้ำ)

## วิธีทำงานทุกครั้ง (ทุกทีม)

- **ก่อนแก้** อ่านไฟล์ที่เกี่ยวข้องและอธิบายแผนสั้นๆ ให้ผู้สั่งงานก่อน งานใหญ่ให้ถามก่อนลงมือ
- เขียนโค้ดให้กลมกลืนกับของเดิม: คอมเมนต์ภาษาไทยอธิบาย **"ทำไม"** ไม่ใช่ "ทำอะไร", ชื่อตัวแปรภาษาอังกฤษ,
  ข้อความบนหน้าจอภาษาไทย
- ทุกงานต้องรัน `cd Lamunn-Finance && npx tsc --noEmit` ให้ผ่าน
- ทุกงานที่แตะตรรกะบัญชี/รายงาน ต้องมีสคริปต์พิสูจน์ใน `Lamunn-Finance/scripts/verify-<ชื่อ>.ts` รูปแบบเดียวกับ
  `verify-*.ts` ที่มีอยู่ (สร้างข้อมูลทดสอบ → ตรวจด้วย `check()` → ลบใน `finally`) และรันให้ผ่าน:
  `npx tsx scripts/verify-<ชื่อ>.ts`
- **ข้อมูลทดสอบต้องใช้วันที่ปี ค.ศ. 2090 ขึ้นไป** และชื่อขึ้นต้น `[test]` ตอนลบต้องลบเฉพาะ id ที่ตัวเองสร้าง
  **ห้าม `deleteMany` ด้วยเงื่อนไขกว้าง** (เคยมีเคสสคริปต์ทดสอบลบข้อมูลจริงมาแล้ว)
- ฟังก์ชันที่เรียก `getAllSettings()` ใช้แคชของ Next ซึ่งไม่มีนอกเซิร์ฟเวอร์ — ถ้าต้องเทสจากสคริปต์ ให้รับค่า
  (เช่น `vatRate`) เป็น option แทน ดูตัวอย่างใน `purchaseInvoiceEdit.ts`
- `.env` ในเครื่องพัฒนาชี้ฐานข้อมูล **dev** ไม่ใช่ production — ห้ามชี้ไป production เด็ดขาด
- **ไม่ต้อง deploy และห้ามรัน `vercel`** — การ deploy เกิดอัตโนมัติเมื่อ PR ถูก merge เข้า `master`
- ทำงานบน branch ของทีมตัวเองเท่านั้น (ทีมบัญชี `acc/`, ทีม Catering `cat/`) ห้าม commit ลง `master` โดยตรง
- ห้ามแก้ `package.json` / เพิ่ม dependency โดยไม่บอกก่อน (ไลบรารีที่มีแล้ว: exceljs, lucide-react, clsx)

## แผนที่โค้ดบัญชี

| ส่วน | ที่อยู่ |
|---|---|
| หน้าจอ | `src/app/(app)/accounting/*` (แท็บใน `src/components/accounting/AccountingTabs.tsx`) |
| API | `src/app/api/accounting/*` (ตรวจสิทธิ์ด้วย `requireSectionApi("ACCOUNTING", "edit")`) |
| เครื่องยนต์ลงบัญชี | `src/lib/accounting/post.ts` |
| งบการเงิน | `src/lib/accounting/reports.ts` (งบทดลอง / กำไรขาดทุน / ฐานะการเงิน) |
| ยอดขายรายวัน → บัญชี | `src/lib/accounting/dailySales.ts` |
| รายงานภาษี | `src/lib/accounting/taxReports.ts` + `journalTaxLines.ts` + `inputVatExcel.ts` |
| แก้ใบกำกับภาษีซื้อ | `src/lib/accounting/purchaseInvoiceEdit.ts` |
| นำเข้าคู่ค้า/ผังบัญชี | `src/lib/accounting/partnerImport.ts`, `chartOfAccounts.ts` |
| พิมพ์ใบสำคัญ | `src/app/print/journal/[id]/page.tsx` (นอก `(app)` เพื่อไม่ให้เมนูติดไปตอนพิมพ์) |
| โมเดล DB | `packages/db-finance/prisma/schema.prisma` model `Acc*` (ตาราง `acc_*`) |

## ส่งงาน

1. `git checkout -b acc/<ชื่องาน>` (ทีมบัญชี) หรือ `cat/<ชื่องาน>` (ทีม Catering) จาก `master` ล่าสุด
2. แก้ → `tsc` ผ่าน → verify script ผ่าน
3. `git commit` ข้อความสรุปสั้นๆ ว่าทำอะไร แล้ว `git push -u origin HEAD` เปิด Pull Request
4. CI จะตรวจขอบเขตไฟล์ + `tsc` ผ่านแล้วถึง merge ได้ — merge แล้วระบบ deploy ขึ้น production ให้เอง
