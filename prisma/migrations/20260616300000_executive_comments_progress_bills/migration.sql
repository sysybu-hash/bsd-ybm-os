-- ProgressBill workflow fields
ALTER TABLE "ProgressBill" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "ProgressBill" ADD COLUMN IF NOT EXISTS "contractorName" TEXT;
ALTER TABLE "ProgressBill" ADD COLUMN IF NOT EXISTS "completionPercent" DOUBLE PRECISION;
ALTER TABLE "ProgressBill" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);
ALTER TABLE "ProgressBill" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "ProgressBill" ADD COLUMN IF NOT EXISTS "approvedByUserId" TEXT;

CREATE INDEX IF NOT EXISTS "ProgressBill_organizationId_status_idx"
  ON "ProgressBill"("organizationId", "status");

-- Contextual comments on tasks / documents
CREATE TABLE IF NOT EXISTS "ContextComment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContextComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContextComment_organizationId_targetType_targetId_idx"
  ON "ContextComment"("organizationId", "targetType", "targetId");

CREATE INDEX IF NOT EXISTS "ContextComment_authorUserId_idx"
  ON "ContextComment"("authorUserId");

DO $$ BEGIN
  ALTER TABLE "ContextComment"
    ADD CONSTRAINT "ContextComment_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ContextComment"
    ADD CONSTRAINT "ContextComment_authorUserId_fkey"
    FOREIGN KEY ("authorUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
