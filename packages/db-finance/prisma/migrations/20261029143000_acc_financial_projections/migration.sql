-- ประมาณการเก็บแยกจากใบสำคัญ เพื่อให้แก้ตัวเลขวางแผนได้โดยไม่กระทบบัญชีจริง
CREATE TABLE "acc_financial_projections" (
  "id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "estimatedRevenue" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "estimatedExpense" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "acc_financial_projections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "acc_financial_projections_month_check" CHECK ("month" BETWEEN 1 AND 12)
);

CREATE UNIQUE INDEX "acc_financial_projections_year_month_key"
ON "acc_financial_projections"("year", "month");

CREATE INDEX "acc_financial_projections_year_idx"
ON "acc_financial_projections"("year");

CREATE TABLE "acc_tax_loss_carryforwards" (
  "id" TEXT NOT NULL,
  "reportYear" INTEGER NOT NULL,
  "lossYear" INTEGER NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "acc_tax_loss_carryforwards_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "acc_tax_loss_carryforwards_year_check" CHECK ("lossYear" >= "reportYear" - 5 AND "lossYear" < "reportYear")
);

CREATE UNIQUE INDEX "acc_tax_loss_carryforwards_reportYear_lossYear_key"
ON "acc_tax_loss_carryforwards"("reportYear", "lossYear");

CREATE INDEX "acc_tax_loss_carryforwards_reportYear_idx"
ON "acc_tax_loss_carryforwards"("reportYear");
