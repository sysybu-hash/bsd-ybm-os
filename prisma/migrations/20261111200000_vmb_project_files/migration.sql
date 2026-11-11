-- VisualModuBuild: uploaded source files of a project (stored in Blob).
-- Additive only.
CREATE TABLE IF NOT EXISTS "VmbProjectFile" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,
    "relPath" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "blobPath" TEXT NOT NULL,
    "uploadedBy" TEXT,
    CONSTRAINT "VmbProjectFile_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VmbProjectFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VmbProject"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "VmbProjectFile_projectId_relPath_key" ON "VmbProjectFile"("projectId", "relPath");
