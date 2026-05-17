-- CreateEnum
CREATE TYPE "DriveDecodeStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'NEEDS_REVIEW');

-- AlterTable
ALTER TABLE "CloudIntegration" ADD COLUMN IF NOT EXISTS "driveAutoDecodeOnSync" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CloudIntegration" ADD COLUMN IF NOT EXISTS "driveAutoSaveAfterDecode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CloudIntegration" ADD COLUMN IF NOT EXISTS "driveAskBeforeSave" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "DriveSyncEntry" ADD COLUMN IF NOT EXISTS "decodeStatus" "DriveDecodeStatus";
ALTER TABLE "DriveSyncEntry" ADD COLUMN IF NOT EXISTS "decodeError" TEXT;
ALTER TABLE "DriveSyncEntry" ADD COLUMN IF NOT EXISTS "linkedDocumentId" TEXT;
ALTER TABLE "DriveSyncEntry" ADD COLUMN IF NOT EXISTS "lastDecodedAt" TIMESTAMP(3);
ALTER TABLE "DriveSyncEntry" ADD COLUMN IF NOT EXISTS "detectedClientName" TEXT;
ALTER TABLE "DriveSyncEntry" ADD COLUMN IF NOT EXISTS "detectedDocType" TEXT;

CREATE INDEX IF NOT EXISTS "DriveSyncEntry_organizationId_decodeStatus_idx" ON "DriveSyncEntry"("organizationId", "decodeStatus");
