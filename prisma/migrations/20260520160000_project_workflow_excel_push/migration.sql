-- Project workflow: Drive, BOQ, progress bills, work diary extensions, push, gantt import

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "driveFolderId" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "driveFolderName" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "lastScheduleImportAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "scheduleSourceFile" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "crmSyncPolicyJson" JSONB;

ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "parentTaskId" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "externalTaskId" TEXT;

ALTER TABLE "WorkDiary" ADD COLUMN IF NOT EXISTS "weather" TEXT;
ALTER TABLE "WorkDiary" ADD COLUMN IF NOT EXISTS "workHours" DOUBLE PRECISION;
ALTER TABLE "WorkDiary" ADD COLUMN IF NOT EXISTS "materialsJson" JSONB;
ALTER TABLE "WorkDiary" ADD COLUMN IF NOT EXISTS "photosJson" JSONB;
ALTER TABLE "WorkDiary" ADD COLUMN IF NOT EXISTS "meckanoRef" TEXT;
ALTER TABLE "WorkDiary" ADD COLUMN IF NOT EXISTS "linkedTaskId" TEXT;
ALTER TABLE "WorkDiary" ADD COLUMN IF NOT EXISTS "linkedBoqLineId" TEXT;
ALTER TABLE "WorkDiary" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "ProjectQuote" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sourceFileName" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectQuote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProjectBoqLine" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quoteId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sectionTitle" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" DOUBLE PRECISION,
    "unitPrice" DOUBLE PRECISION,
    "lineTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isSectionSubtotal" BOOLEAN NOT NULL DEFAULT false,
    "executedQuantity" DOUBLE PRECISION,
    "progressCoefficient" DOUBLE PRECISION,
    "billedAmount" DOUBLE PRECISION,
    "isWorkDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectBoqLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProjectBoqPhaseColumn" (
    "id" TEXT NOT NULL,
    "boqLineId" TEXT NOT NULL,
    "phaseIndex" INTEGER NOT NULL,
    "coefficient" DOUBLE PRECISION,
    "phaseAmount" DOUBLE PRECISION,
    CONSTRAINT "ProjectBoqPhaseColumn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProgressBill" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "billNumber" INTEGER NOT NULL,
    "billDate" TIMESTAMP(3),
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountPercent" DOUBLE PRECISION,
    "vatPercent" DOUBLE PRECISION,
    "adjustmentsJson" JSONB,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProgressBill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProgressBillLine" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "boqLineId" TEXT,
    "description" TEXT,
    "contractQty" DOUBLE PRECISION,
    "unitPrice" DOUBLE PRECISION,
    "executedQty" DOUBLE PRECISION,
    "executedCoef" DOUBLE PRECISION,
    "lineTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "ProgressBillLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectBoqPhaseColumn_boqLineId_phaseIndex_key" ON "ProjectBoqPhaseColumn"("boqLineId", "phaseIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "ProgressBill_projectId_billNumber_key" ON "ProgressBill"("projectId", "billNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

CREATE INDEX IF NOT EXISTS "ProjectQuote_projectId_idx" ON "ProjectQuote"("projectId");
CREATE INDEX IF NOT EXISTS "ProjectQuote_organizationId_idx" ON "ProjectQuote"("organizationId");
CREATE INDEX IF NOT EXISTS "ProjectBoqLine_projectId_idx" ON "ProjectBoqLine"("projectId");
CREATE INDEX IF NOT EXISTS "ProjectBoqLine_organizationId_idx" ON "ProjectBoqLine"("organizationId");
CREATE INDEX IF NOT EXISTS "ProjectBoqLine_quoteId_idx" ON "ProjectBoqLine"("quoteId");
CREATE INDEX IF NOT EXISTS "ProgressBill_organizationId_idx" ON "ProgressBill"("organizationId");
CREATE INDEX IF NOT EXISTS "ProgressBillLine_billId_idx" ON "ProgressBillLine"("billId");
CREATE INDEX IF NOT EXISTS "ProgressBillLine_boqLineId_idx" ON "ProgressBillLine"("boqLineId");
CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId");

ALTER TABLE "ProjectQuote" ADD CONSTRAINT "ProjectQuote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectQuote" ADD CONSTRAINT "ProjectQuote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectBoqLine" ADD CONSTRAINT "ProjectBoqLine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectBoqLine" ADD CONSTRAINT "ProjectBoqLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectBoqLine" ADD CONSTRAINT "ProjectBoqLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "ProjectQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectBoqPhaseColumn" ADD CONSTRAINT "ProjectBoqPhaseColumn_boqLineId_fkey" FOREIGN KEY ("boqLineId") REFERENCES "ProjectBoqLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgressBill" ADD CONSTRAINT "ProgressBill_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgressBill" ADD CONSTRAINT "ProgressBill_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgressBillLine" ADD CONSTRAINT "ProgressBillLine_billId_fkey" FOREIGN KEY ("billId") REFERENCES "ProgressBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgressBillLine" ADD CONSTRAINT "ProgressBillLine_boqLineId_fkey" FOREIGN KEY ("boqLineId") REFERENCES "ProjectBoqLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
