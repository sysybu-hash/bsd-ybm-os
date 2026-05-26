-- Contact tags for CRM dynamic filtering
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Neon / Prisma migrate: no CONCURRENTLY inside transaction (see docs/ONBOARDING.md)
CREATE INDEX IF NOT EXISTS "Contact_tags_gin_idx" ON "Contact" USING GIN ("tags");

-- Meckano scheduled sync metadata
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "meckanoAutoSyncEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "meckanoLastSyncAt" TIMESTAMP(3);
