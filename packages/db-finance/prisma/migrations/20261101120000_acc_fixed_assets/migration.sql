CREATE TYPE "AccFixedAssetCategory" AS ENUM (
  'LAND', 'BUILDING', 'OFFICE_EQUIPMENT', 'COMPUTER',
  'FURNITURE', 'MACHINERY', 'VEHICLE', 'SOFTWARE'
);

CREATE TYPE "AccFixedAssetStatus" AS ENUM ('ACTIVE', 'DISPOSED');

INSERT INTO "acc_accounts" ("id", "code", "nameTh", "type", "parentCode", "isPostable", "isActive", "sortOrder", "createdAt", "updatedAt") VALUES
  ('acc_fixed_asset_land_1650', '1650', 'ที่ดิน', 'ASSET', '1600', true, true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('acc_fixed_asset_building_1660', '1660', 'อาคาร', 'ASSET', '1600', true, true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('acc_fixed_asset_software_1670', '1670', 'ซอฟต์แวร์คอมพิวเตอร์', 'ASSET', '1600', true, true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('acc_fixed_asset_machine_1680', '1680', 'เครื่องจักรและอุปกรณ์ในโรงงาน', 'ASSET', '1600', true, true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

CREATE TABLE "acc_fixed_assets" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" "AccFixedAssetCategory" NOT NULL,
  "status" "AccFixedAssetStatus" NOT NULL DEFAULT 'ACTIVE',
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "purchaseDate" DATE NOT NULL,
  "availableDate" DATE NOT NULL,
  "unitCost" DECIMAL(15,2) NOT NULL,
  "residualValue" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "usefulLifeMonths" INTEGER NOT NULL,
  "taxRatePercent" DECIMAL(7,4),
  "invoiceNo" TEXT,
  "branchId" TEXT,
  "note" TEXT,
  "dataIncomplete" BOOLEAN NOT NULL DEFAULT false,
  "assetAccountId" TEXT NOT NULL,
  "sourceLineId" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "acc_fixed_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "acc_fixed_asset_disposals" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "saleDate" DATE NOT NULL,
  "quantity" INTEGER NOT NULL,
  "saleBaseAmount" DECIMAL(15,2) NOT NULL,
  "vatAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "buyer" TEXT,
  "documentNo" TEXT,
  "note" TEXT,
  "draftEntryId" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "acc_fixed_asset_disposals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "acc_fixed_assets_code_key" ON "acc_fixed_assets"("code");
CREATE UNIQUE INDEX "acc_fixed_assets_sourceLineId_key" ON "acc_fixed_assets"("sourceLineId");
CREATE INDEX "acc_fixed_assets_status_category_idx" ON "acc_fixed_assets"("status", "category");
CREATE INDEX "acc_fixed_assets_branchId_idx" ON "acc_fixed_assets"("branchId");
CREATE INDEX "acc_fixed_assets_availableDate_idx" ON "acc_fixed_assets"("availableDate");
CREATE UNIQUE INDEX "acc_fixed_asset_disposals_draftEntryId_key" ON "acc_fixed_asset_disposals"("draftEntryId");
CREATE INDEX "acc_fixed_asset_disposals_assetId_saleDate_idx" ON "acc_fixed_asset_disposals"("assetId", "saleDate");

ALTER TABLE "acc_fixed_assets"
  ADD CONSTRAINT "acc_fixed_assets_assetAccountId_fkey"
  FOREIGN KEY ("assetAccountId") REFERENCES "acc_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "acc_fixed_assets"
  ADD CONSTRAINT "acc_fixed_assets_sourceLineId_fkey"
  FOREIGN KEY ("sourceLineId") REFERENCES "acc_journal_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "acc_fixed_asset_disposals"
  ADD CONSTRAINT "acc_fixed_asset_disposals_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "acc_fixed_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "acc_fixed_asset_disposals"
  ADD CONSTRAINT "acc_fixed_asset_disposals_draftEntryId_fkey"
  FOREIGN KEY ("draftEntryId") REFERENCES "acc_journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
