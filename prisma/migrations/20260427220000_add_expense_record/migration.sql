-- Enums
CREATE TYPE "ExpenseAllocation" AS ENUM ('OFFICE', 'PROJECT', 'CLIENT');
CREATE TYPE "ExpenseRecordStatus" AS ENUM ('DRAFT', 'POSTED');

-- CreateTable
CREATE TABLE "ExpenseRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "expenseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "amountNet" DOUBLE PRECISION NOT NULL,
    "vat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL,
    "allocation" "ExpenseAllocation" NOT NULL DEFAULT 'OFFICE',
    "projectId" TEXT,
    "contactId" TEXT,
    "status" "ExpenseRecordStatus" NOT NULL DEFAULT 'POSTED',
    "sourceDocumentId" TEXT,
    "aiExtractedJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseRecord_organizationId_expenseDate_idx" ON "ExpenseRecord"("organizationId", "expenseDate");
CREATE INDEX "ExpenseRecord_organizationId_allocation_idx" ON "ExpenseRecord"("organizationId", "allocation");
CREATE INDEX "ExpenseRecord_projectId_idx" ON "ExpenseRecord"("projectId");
CREATE INDEX "ExpenseRecord_contactId_idx" ON "ExpenseRecord"("contactId");

-- AddForeignKey
ALTER TABLE "ExpenseRecord" ADD CONSTRAINT "ExpenseRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseRecord" ADD CONSTRAINT "ExpenseRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseRecord" ADD CONSTRAINT "ExpenseRecord_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseRecord" ADD CONSTRAINT "ExpenseRecord_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
