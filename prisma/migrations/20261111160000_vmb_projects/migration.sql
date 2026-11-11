-- VisualModuBuild projects, jobs with live progress, and per-file scan reports.
-- Additive only; no reference to the platform's tables.
CREATE TABLE IF NOT EXISTS "VmbProject" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'building',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "manifest" JSONB,
    "filesDeleteAt" TIMESTAMP(3),
    CONSTRAINT "VmbProject_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VmbProject_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "VmbWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "VmbProject_workspaceId_updatedAt_idx" ON "VmbProject"("workspaceId", "updatedAt");

CREATE TABLE IF NOT EXISTS "VmbJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" JSONB,
    "percent" INTEGER NOT NULL DEFAULT 0,
    "etaSeconds" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "costCredits" INTEGER,
    "computeMs" INTEGER,
    CONSTRAINT "VmbJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VmbJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "VmbWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VmbJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VmbProject"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "VmbJob_projectId_createdAt_idx" ON "VmbJob"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "VmbJob_workspaceId_status_idx" ON "VmbJob"("workspaceId", "status");

CREATE TABLE IF NOT EXISTS "VmbScanReport" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,
    "jobId" TEXT,
    "fileName" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "counts" JSONB NOT NULL,
    "inkCoverage" DOUBLE PRECISION,
    "unread" JSONB NOT NULL,
    CONSTRAINT "VmbScanReport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VmbScanReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VmbProject"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "VmbScanReport_projectId_fileName_round_key" ON "VmbScanReport"("projectId", "fileName", "round");
