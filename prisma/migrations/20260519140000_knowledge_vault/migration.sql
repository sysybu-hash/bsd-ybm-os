-- CreateEnum
CREATE TYPE "KnowledgeVaultPath" AS ENUM ('INGEST', 'PARSED', 'ISSUED', 'ARCHIVE');

-- AlterTable
ALTER TABLE "CloudIntegration" ADD COLUMN IF NOT EXISTS "knowledgeVaultFoldersJson" JSONB;

-- AlterTable
ALTER TABLE "DriveSyncEntry" ADD COLUMN IF NOT EXISTS "vaultPath" "KnowledgeVaultPath";
ALTER TABLE "DriveSyncEntry" ADD COLUMN IF NOT EXISTS "parsedSummary" JSONB;
ALTER TABLE "DriveSyncEntry" ADD COLUMN IF NOT EXISTS "issuedByWidget" TEXT;
ALTER TABLE "DriveSyncEntry" ADD COLUMN IF NOT EXISTS "sourceWidgetId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DriveSyncEntry_organizationId_vaultPath_idx" ON "DriveSyncEntry"("organizationId", "vaultPath");
