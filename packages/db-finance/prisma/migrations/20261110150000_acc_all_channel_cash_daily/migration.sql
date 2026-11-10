CREATE TABLE "acc_all_channel_cash_daily" (
    "id" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "branchKey" TEXT NOT NULL,
    "branchName" TEXT NOT NULL,
    "branchOrder" INTEGER NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "sourceFile" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acc_all_channel_cash_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "acc_all_channel_cash_daily_period_year_period_month_day_branch_key_key"
ON "acc_all_channel_cash_daily"("periodYear", "periodMonth", "day", "branchKey");

CREATE INDEX "acc_all_channel_cash_daily_period_year_period_month_branch_order_idx"
ON "acc_all_channel_cash_daily"("periodYear", "periodMonth", "branchOrder");
