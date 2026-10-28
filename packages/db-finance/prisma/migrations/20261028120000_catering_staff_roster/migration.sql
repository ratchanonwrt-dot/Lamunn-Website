-- รายชื่อพนักงาน Catering + ชั่วโมง OT และค่ารถต่อการไปงาน (สำหรับคิด OT สิ้นเดือน และค่ารถ/ค่าข้าวรายรอบ)
-- เพิ่มอย่างเดียว ไม่แตะข้อมูลเดิม — โค้ดที่รันอยู่ไม่รู้จักตาราง/คอลัมน์ใหม่ก็ทำงานต่อได้ปกติ
CREATE TABLE IF NOT EXISTS "catering_staff" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dayOffs" TEXT NOT NULL DEFAULT '',
    "otRatePerHour" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dayOffRatePerHour" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "catering_staff_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "catering_staff_name_key" ON "catering_staff"("name");

ALTER TABLE "catering_booking_staff" ADD COLUMN IF NOT EXISTS "otHours" DOUBLE PRECISION;
ALTER TABLE "catering_booking_staff" ADD COLUMN IF NOT EXISTS "travelCost" DOUBLE PRECISION;
