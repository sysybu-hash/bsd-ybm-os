-- A building booklet made from a permit strip (DWF), in steps: each step
-- runs within one function's time and leaves its work in Blob and its place
-- in "state". Additive only; nothing existing is touched.
CREATE TABLE IF NOT EXISTS "BuildingBookletJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "stage" TEXT NOT NULL DEFAULT 'model',
    "state" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT NOT NULL,
    "resultUrl" TEXT,
    "error" TEXT,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "BuildingBookletJob_pkey" PRIMARY KEY ("id")
);

-- Not CONCURRENTLY: migrate deploy runs inside a transaction, and the table is new and empty.
CREATE INDEX IF NOT EXISTS "BuildingBookletJob_organizationId_createdAt_idx" ON "BuildingBookletJob"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "BuildingBookletJob_status_updatedAt_idx" ON "BuildingBookletJob"("status", "updatedAt");
