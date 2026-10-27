-- ปฏิทินงาน Catering: วันครบกำหนดจ่ายของแต่ละงาน + ช่องทางติดต่อเพิ่ม (โทรศัพท์ / TikTok)
-- เพิ่มอย่างเดียว ไม่แตะข้อมูลเดิม — โค้ดเก่าที่ยังไม่รู้จักคอลัมน์/ค่าใหม่ทำงานต่อได้ปกติ
ALTER TYPE "CustomerSource" ADD VALUE IF NOT EXISTS 'PHONE';
ALTER TYPE "CustomerSource" ADD VALUE IF NOT EXISTS 'TIKTOK';

ALTER TABLE "catering_bookings" ADD COLUMN IF NOT EXISTS "paymentDueDate" DATE;
