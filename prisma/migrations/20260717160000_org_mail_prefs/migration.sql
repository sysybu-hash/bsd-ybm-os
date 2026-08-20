-- Per-tenant email preferences (org admin self-serve)
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "mailPrefsJson" JSONB;
