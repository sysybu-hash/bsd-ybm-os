-- ארכיון ERP: פח אשפה (מחיקה רכה) ושיתוף פנימי בין משתמשי ארגון
ALTER TABLE "IssuedDocument" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
ALTER TABLE "IssuedDocument" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "IssuedDocument_organizationId_deletedAt_idx" ON "IssuedDocument"("organizationId", "deletedAt");
CREATE INDEX IF NOT EXISTS "Document_organizationId_deletedAt_idx" ON "Document"("organizationId", "deletedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'IssuedDocument_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "IssuedDocument"
      ADD CONSTRAINT "IssuedDocument_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
