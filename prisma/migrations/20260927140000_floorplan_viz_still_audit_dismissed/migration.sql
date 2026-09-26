-- Findings a person looked at and marked wrong, with who and when. Kept apart
-- from auditMeta, which a rescan replaces whole. Additive and nullable.
ALTER TABLE "FloorplanVizStill" ADD COLUMN IF NOT EXISTS "auditDismissed" JSONB;
