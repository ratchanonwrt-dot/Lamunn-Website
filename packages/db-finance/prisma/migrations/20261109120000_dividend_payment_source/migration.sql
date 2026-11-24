-- ปันผลแต่ละรายการจ่ายจากไหน: 'CASH' = เงินสด, 'BANK' = บัญชีบริษัท, NULL = ยังไม่ระบุ
-- เพิ่มอย่างเดียว ไม่แตะข้อมูลเดิม — โค้ดที่รันอยู่ไม่รู้จักคอลัมน์ใหม่ก็ทำงานต่อได้ปกติ
ALTER TABLE "dividend_payments" ADD COLUMN IF NOT EXISTS "source" TEXT;
