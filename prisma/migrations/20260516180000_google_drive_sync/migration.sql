-- Google Drive workspace folder + bidirectional sync metadata

ALTER TABLE "CloudIntegration" ADD COLUMN IF NOT EXISTS "driveFolderId" TEXT;
ALTER TABLE "CloudIntegration" ADD COLUMN IF NOT EXISTS "driveFolderName" TEXT DEFAULT 'BSD-YBM';
ALTER TABLE "CloudIntegration" ADD COLUMN IF NOT EXISTS "driveSyncEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CloudIntegration" ADD COLUMN IF NOT EXISTS "driveSyncCursor" TEXT;

CREATE TABLE IF NOT EXISTS "DriveSyncEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "parentDriveId" TEXT,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "md5Checksum" TEXT,
    "modifiedTime" TIMESTAMP(3),
    "webViewLink" TEXT,
    "trashed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriveSyncEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DriveSyncEntry_organizationId_driveFileId_key" ON "DriveSyncEntry"("organizationId", "driveFileId");
CREATE INDEX IF NOT EXISTS "DriveSyncEntry_organizationId_parentDriveId_idx" ON "DriveSyncEntry"("organizationId", "parentDriveId");
CREATE INDEX IF NOT EXISTS "DriveSyncEntry_organizationId_trashed_idx" ON "DriveSyncEntry"("organizationId", "trashed");

ALTER TABLE "DriveSyncEntry" DROP CONSTRAINT IF EXISTS "DriveSyncEntry_organizationId_fkey";
ALTER TABLE "DriveSyncEntry" ADD CONSTRAINT "DriveSyncEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
