-- Idempotent: optional link from CRM Project to MeckanoZone
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Project'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Project'
      AND column_name = 'meckanoZoneId'
  ) THEN
    ALTER TABLE "Project" ADD COLUMN "meckanoZoneId" TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Project_meckanoZoneId_idx" ON "Project"("meckanoZoneId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Project_meckanoZoneId_fkey'
  ) THEN
    ALTER TABLE "Project"
      ADD CONSTRAINT "Project_meckanoZoneId_fkey"
      FOREIGN KEY ("meckanoZoneId") REFERENCES "MeckanoZone"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
