-- AlterTable: Google Drive storage fields on Document (scan archive)
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "fileDriveId" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "fileDriveWebViewLink" TEXT;

-- Index for Drive file lookups (standard CREATE INDEX — Prisma migrate runs in a transaction)
CREATE INDEX IF NOT EXISTS "Document_fileDriveId_idx" ON "Document"("fileDriveId");
