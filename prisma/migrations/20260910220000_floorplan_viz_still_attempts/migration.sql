-- Every decode / edit of a view is kept. The unique viewKey was overwriting
-- the previous still, so the operator could not compare attempts.

DROP INDEX IF EXISTS "FloorplanVizStill_runId_viewKey_key";

ALTER TABLE "FloorplanVizStill" ADD COLUMN IF NOT EXISTS "selected" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "FloorplanVizStill" ADD COLUMN IF NOT EXISTS "parentStillId" TEXT;
ALTER TABLE "FloorplanVizStill" ADD COLUMN IF NOT EXISTS "origin" TEXT NOT NULL DEFAULT 'generate';
ALTER TABLE "FloorplanVizStill" ADD COLUMN IF NOT EXISTS "attemptIndex" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS "FloorplanVizStill_runId_viewKey_createdAt_idx"
  ON "FloorplanVizStill"("runId", "viewKey", "createdAt");
