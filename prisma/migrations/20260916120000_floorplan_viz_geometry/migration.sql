-- The measured flat, kept with the run so the 3D viewer can draw it without
-- paying to read the sheet again. Nullable: every run made before this, and
-- every run that took the raster path, has no geometry to store.

ALTER TABLE "FloorplanVizRun" ADD COLUMN IF NOT EXISTS "geometryJson" JSONB;
