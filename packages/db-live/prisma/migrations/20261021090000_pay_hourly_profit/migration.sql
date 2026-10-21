-- AlterTable
ALTER TABLE "pay_settings" ADD COLUMN     "adsPct" DOUBLE PRECISION NOT NULL DEFAULT 10,
ADD COLUMN     "hourlyFrom" DATE,
ADD COLUMN     "hourlyRate" DOUBLE PRECISION NOT NULL DEFAULT 250,
ADD COLUMN     "payMode" TEXT NOT NULL DEFAULT 'COMMISSION',
ADD COLUMN     "platformFeePct" DOUBLE PRECISION NOT NULL DEFAULT 12;


-- ผู้ใช้สั่งเปลี่ยนเป็นจ่ายเหมาชั่วโมงละ 250 บาท ไม่มีคอมมิชชั่น ตั้งแต่ 2026-10-21 (กะก่อนหน้ายังคิดแบบเดิม)
UPDATE "pay_settings" SET "payMode" = 'HOURLY', "hourlyRate" = 250, "hourlyFrom" = '2026-10-21' WHERE "id" = 'default';
