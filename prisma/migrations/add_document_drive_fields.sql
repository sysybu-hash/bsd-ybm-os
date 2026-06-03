-- Migration: add Google Drive storage fields to Document
-- Purpose: After scanning, store the original file in the user's Google Drive.
--          fileDriveId  = Drive file ID (for re-download / re-open)
--          fileDriveWebViewLink = direct browser URL to the file in Drive

ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "fileDriveId"          TEXT,
  ADD COLUMN IF NOT EXISTS "fileDriveWebViewLink"  TEXT;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Document_fileDriveId_idx"
  ON "Document" ("fileDriveId")
  WHERE "fileDriveId" IS NOT NULL;
