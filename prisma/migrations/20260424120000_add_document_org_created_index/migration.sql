DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Document'
  ) THEN
    CREATE INDEX IF NOT EXISTS "Document_organizationId_createdAt_idx"
      ON "Document"("organizationId", "createdAt");
  END IF;
END $$;
