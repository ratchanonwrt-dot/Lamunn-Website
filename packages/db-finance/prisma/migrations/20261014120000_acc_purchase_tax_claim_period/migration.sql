-- ใบกำกับอาจลงรายงานภาษีซื้อคนละเดือนกับวันที่เอกสาร จึงต้องเก็บงวดเคลมแยกกัน
ALTER TABLE "acc_purchase_tax_invoices"
ADD COLUMN "claimPeriod" DATE;

CREATE INDEX "acc_purchase_tax_invoices_claimPeriod_idx"
ON "acc_purchase_tax_invoices"("claimPeriod");
