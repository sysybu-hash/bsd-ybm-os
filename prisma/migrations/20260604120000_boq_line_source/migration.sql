-- Add source field to ProjectBoqLine to track origin (MANUAL, BLUEPRINT, IMPORT)
ALTER TABLE "ProjectBoqLine"
  ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'MANUAL';
