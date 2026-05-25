-- Field Copilot asset Drive archive fields
ALTER TABLE "FieldCopilotAsset" ADD COLUMN IF NOT EXISTS "driveFileId" TEXT;
ALTER TABLE "FieldCopilotAsset" ADD COLUMN IF NOT EXISTS "driveWebViewLink" TEXT;
ALTER TABLE "FieldCopilotAsset" ADD COLUMN IF NOT EXISTS "driveFolderId" TEXT;
ALTER TABLE "FieldCopilotAsset" ADD COLUMN IF NOT EXISTS "driveArchiveStatus" TEXT;
ALTER TABLE "FieldCopilotAsset" ADD COLUMN IF NOT EXISTS "driveError" TEXT;
