-- CreateEnum
CREATE TYPE "CateringBranchDutyKind" AS ENUM ('TRAINING', 'COVER');

-- CreateTable
CREATE TABLE "catering_branch_duties" (
    "id" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "CateringBranchDutyKind" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "branchName" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catering_branch_duties_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "catering_branch_duties_date_idx" ON "catering_branch_duties"("date");
