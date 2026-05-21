-- Idempotent: baseline ריק ב-CI; בפרודקשן הטבלה כבר קיימת מ-Neon
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'DocumentLineItem'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'DocumentLineItem'
      AND column_name = 'priceAlertPending'
  ) THEN
    ALTER TABLE "DocumentLineItem"
      ADD COLUMN "priceAlertPending" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'DocumentLineItem'
  ) THEN
    CREATE INDEX IF NOT EXISTS "DocumentLineItem_organizationId_priceAlertPending_idx"
      ON "DocumentLineItem"("organizationId", "priceAlertPending");
  END IF;
END $$;
