-- PO branded PDF: link PurchaseOrder to IssuedDocument + DocType PURCHASE_ORDER

ALTER TYPE "DocType" ADD VALUE IF NOT EXISTS 'PURCHASE_ORDER';

ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "issuedDocumentId" TEXT;

CREATE INDEX IF NOT EXISTS "PurchaseOrder_issuedDocumentId_idx" ON "PurchaseOrder"("issuedDocumentId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseOrder_issuedDocumentId_fkey'
  ) THEN
    ALTER TABLE "PurchaseOrder"
      ADD CONSTRAINT "PurchaseOrder_issuedDocumentId_fkey"
      FOREIGN KEY ("issuedDocumentId") REFERENCES "IssuedDocument"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
