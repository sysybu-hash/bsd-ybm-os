-- Who found what on each saved still: the model and prompt version behind
-- every audit finding, kept per still and replaced whole on a rescan.
-- Additive and nullable; existing rows are left as they are.
ALTER TABLE "FloorplanVizStill" ADD COLUMN IF NOT EXISTS "auditMeta" JSONB;
