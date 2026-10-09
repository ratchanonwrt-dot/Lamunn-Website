CREATE TYPE "AccAutokeyStatus" AS ENUM ('UPLOADING', 'READY', 'ANALYZING', 'REVIEW', 'DRAFTED', 'FAILED');

CREATE TABLE "acc_autokey_documents" (
  "id" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "fileHash" TEXT NOT NULL,
  "status" "AccAutokeyStatus" NOT NULL DEFAULT 'UPLOADING',
  "extractedData" JSONB,
  "reviewedData" JSONB,
  "errorMessage" TEXT,
  "entryId" TEXT,
  "createdBy" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "acc_autokey_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "acc_autokey_file_chunks" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "acc_autokey_file_chunks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "acc_autokey_rules" (
  "id" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "partnerTaxId" TEXT,
  "keyword" TEXT NOT NULL,
  "journalType" "AccJournalType" NOT NULL,
  "accountId" TEXT NOT NULL,
  "timesConfirmed" INTEGER NOT NULL DEFAULT 1,
  "timesOverridden" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastConfirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "acc_autokey_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "acc_autokey_documents_fileHash_key" ON "acc_autokey_documents"("fileHash");
CREATE UNIQUE INDEX "acc_autokey_documents_entryId_key" ON "acc_autokey_documents"("entryId");
CREATE INDEX "acc_autokey_documents_status_createdAt_idx" ON "acc_autokey_documents"("status", "createdAt");
CREATE UNIQUE INDEX "acc_autokey_file_chunks_documentId_chunkIndex_key" ON "acc_autokey_file_chunks"("documentId", "chunkIndex");
CREATE UNIQUE INDEX "acc_autokey_rules_scopeKey_key" ON "acc_autokey_rules"("scopeKey");
CREATE INDEX "acc_autokey_rules_partnerTaxId_isActive_idx" ON "acc_autokey_rules"("partnerTaxId", "isActive");

ALTER TABLE "acc_autokey_documents" ADD CONSTRAINT "acc_autokey_documents_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "acc_journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "acc_autokey_file_chunks" ADD CONSTRAINT "acc_autokey_file_chunks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "acc_autokey_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "acc_autokey_rules" ADD CONSTRAINT "acc_autokey_rules_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "acc_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
