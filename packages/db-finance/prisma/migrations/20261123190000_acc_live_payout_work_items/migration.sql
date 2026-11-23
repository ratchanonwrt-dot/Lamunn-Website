CREATE TABLE "acc_live_payout_work_items" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "liveDate" DATE NOT NULL,
    "payeeName" TEXT NOT NULL,
    "hours" DECIMAL(8,2) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "note" TEXT,
    "transferQueued" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acc_live_payout_work_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "acc_live_payout_work_items_sourceId_key"
ON "acc_live_payout_work_items"("sourceId");

CREATE INDEX "acc_live_payout_work_items_liveDate_idx"
ON "acc_live_payout_work_items"("liveDate");

CREATE INDEX "acc_live_payout_work_items_transferQueued_idx"
ON "acc_live_payout_work_items"("transferQueued");
