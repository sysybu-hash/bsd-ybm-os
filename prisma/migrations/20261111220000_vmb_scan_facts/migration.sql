-- VisualModuBuild: facts a scan reads off a sheet (units in its header, level marks), for the questions form.
-- Additive only.
ALTER TABLE "VmbScanReport" ADD COLUMN IF NOT EXISTS "facts" JSONB;
