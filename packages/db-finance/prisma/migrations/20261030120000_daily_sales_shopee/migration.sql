-- ช่องทางขายใหม่ Shopee (พนักงานสาขากรอกในรายงานยอด IMS: branch_sales_reports.shopee_amount)
-- เพิ่มอย่างเดียว มีค่า default — โค้ดที่รันอยู่ไม่รู้จักคอลัมน์ใหม่ก็ทำงานต่อได้ปกติ
ALTER TABLE "daily_sales" ADD COLUMN IF NOT EXISTS "shopee" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "daily_sales" ADD COLUMN IF NOT EXISTS "shopeeOverride" BOOLEAN NOT NULL DEFAULT false;
