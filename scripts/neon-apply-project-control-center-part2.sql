-- Neon: הרצה 2 — אחרי שעמודות Project כבר נוספו (שלב 1 בוצע)
-- העתק הכל → SQL Editor → Run (בלי AI)

ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "progress" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "dependencies" TEXT;

CREATE TABLE IF NOT EXISTS "WorkDiary" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workersCount" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "isSyncedToAI" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkDiary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PaymentMilestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "datePaid" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentMilestone_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProjectExtra" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectExtra_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProjectExpense" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectExpense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Project_primaryContactId_idx" ON "Project"("primaryContactId");
CREATE INDEX IF NOT EXISTS "WorkDiary_projectId_idx" ON "WorkDiary"("projectId");
CREATE INDEX IF NOT EXISTS "WorkDiary_organizationId_idx" ON "WorkDiary"("organizationId");
CREATE INDEX IF NOT EXISTS "WorkDiary_date_idx" ON "WorkDiary"("date");
CREATE INDEX IF NOT EXISTS "PaymentMilestone_projectId_idx" ON "PaymentMilestone"("projectId");
CREATE INDEX IF NOT EXISTS "PaymentMilestone_organizationId_idx" ON "PaymentMilestone"("organizationId");
CREATE INDEX IF NOT EXISTS "ProjectExtra_projectId_idx" ON "ProjectExtra"("projectId");
CREATE INDEX IF NOT EXISTS "ProjectExtra_organizationId_idx" ON "ProjectExtra"("organizationId");
CREATE INDEX IF NOT EXISTS "ProjectExpense_projectId_idx" ON "ProjectExpense"("projectId");
CREATE INDEX IF NOT EXISTS "ProjectExpense_organizationId_idx" ON "ProjectExpense"("organizationId");
CREATE INDEX IF NOT EXISTS "ProjectExpense_month_idx" ON "ProjectExpense"("month");

DO $$ BEGIN
 ALTER TABLE "Project" ADD CONSTRAINT "Project_primaryContactId_fkey" FOREIGN KEY ("primaryContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "WorkDiary" ADD CONSTRAINT "WorkDiary_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "WorkDiary" ADD CONSTRAINT "WorkDiary_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "PaymentMilestone" ADD CONSTRAINT "PaymentMilestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "PaymentMilestone" ADD CONSTRAINT "PaymentMilestone_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "ProjectExtra" ADD CONSTRAINT "ProjectExtra_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "ProjectExtra" ADD CONSTRAINT "ProjectExtra_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "ProjectExpense" ADD CONSTRAINT "ProjectExpense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "ProjectExpense" ADD CONSTRAINT "ProjectExpense_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
