-- The structure a run was made for, as confirmed at the identify step, and
-- which plan in the file it drew. Additive and nullable: runs made before the
-- identify step keep NULL.
ALTER TABLE "FloorplanVizRun" ADD COLUMN IF NOT EXISTS "structure" TEXT;
ALTER TABLE "FloorplanVizRun" ADD COLUMN IF NOT EXISTS "planRef" TEXT;
