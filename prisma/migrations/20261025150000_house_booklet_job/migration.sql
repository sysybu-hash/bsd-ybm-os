-- A private-house booklet made in steps on the platform: each step runs
-- within one function's time, keeps its files in the house store (Blob) and
-- its place in "state". Additive only; nothing existing is touched.
CREATE TABLE IF NOT EXISTS "HouseBookletJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'measuring',
    "stage" TEXT NOT NULL DEFAULT 'facades',
    "state" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "HouseBookletJob_pkey" PRIMARY KEY ("id")
);

-- Not CONCURRENTLY: migrate deploy runs inside a transaction, and the table is new and empty.
CREATE INDEX IF NOT EXISTS "HouseBookletJob_organizationId_createdAt_idx" ON "HouseBookletJob"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "HouseBookletJob_status_updatedAt_idx" ON "HouseBookletJob"("status", "updatedAt");
