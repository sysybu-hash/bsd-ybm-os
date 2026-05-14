-- AlterTable
ALTER TABLE "DocumentLineItem" ADD COLUMN "priceAlertPending" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "DocumentLineItem_organizationId_priceAlertPending_idx" ON "DocumentLineItem"("organizationId", "priceAlertPending");
