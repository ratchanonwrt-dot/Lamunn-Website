CREATE TABLE "acc_autokey_drafts" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "pageNumber" INTEGER NOT NULL,
  "extractedData" JSONB NOT NULL,
  "reviewedData" JSONB,
  "entryId" TEXT,
  "createdBy" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "acc_autokey_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "acc_autokey_drafts_entryId_key" ON "acc_autokey_drafts"("entryId");
CREATE UNIQUE INDEX "acc_autokey_drafts_documentId_pageNumber_key" ON "acc_autokey_drafts"("documentId", "pageNumber");

ALTER TABLE "acc_autokey_drafts" ADD CONSTRAINT "acc_autokey_drafts_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "acc_autokey_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "acc_autokey_drafts" ADD CONSTRAINT "acc_autokey_drafts_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "acc_journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
