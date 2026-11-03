CREATE TABLE "acc_partner_branches" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "branchTag" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acc_partner_branches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "acc_partner_branches_partnerId_branchTag_key"
ON "acc_partner_branches"("partnerId", "branchTag");

CREATE INDEX "acc_partner_branches_partnerId_isActive_idx"
ON "acc_partner_branches"("partnerId", "isActive");

ALTER TABLE "acc_partner_branches"
ADD CONSTRAINT "acc_partner_branches_partnerId_fkey"
FOREIGN KEY ("partnerId") REFERENCES "acc_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ย้ายที่อยู่เดิมมาเป็นสาขาเริ่มต้น เพื่อให้คู่ค้าเก่าใช้งานต่อได้ทันทีหลัง deploy
INSERT INTO "acc_partner_branches" (
    "id", "partnerId", "branchTag", "address", "isDefault", "isActive", "createdAt", "updatedAt"
)
SELECT
    'migrated-' || "id",
    "id",
    COALESCE(NULLIF(BTRIM("branchTag"), ''), 'สำนักงานใหญ่'),
    BTRIM("address"),
    true,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "acc_partners"
WHERE "address" IS NOT NULL AND BTRIM("address") <> '';
