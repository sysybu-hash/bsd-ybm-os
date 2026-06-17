DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'workspaceLayoutJson'
  ) THEN
    ALTER TABLE "User" ADD COLUMN "workspaceLayoutJson" JSONB;
  END IF;
END $$;
