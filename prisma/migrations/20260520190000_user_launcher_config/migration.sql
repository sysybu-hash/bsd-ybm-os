DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'launcherConfigJson'
  ) THEN
    ALTER TABLE "User" ADD COLUMN "launcherConfigJson" JSONB;
  END IF;
END $$;
