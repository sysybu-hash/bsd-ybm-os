-- CreateTable
CREATE TABLE "KnowledgeVaultChunk" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "driveEntryId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" JSONB,
    "textHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeVaultChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeVaultChunk_driveEntryId_chunkIndex_key" ON "KnowledgeVaultChunk"("driveEntryId", "chunkIndex");

-- CreateIndex
CREATE INDEX "KnowledgeVaultChunk_organizationId_idx" ON "KnowledgeVaultChunk"("organizationId");

-- AddForeignKey
ALTER TABLE "KnowledgeVaultChunk" ADD CONSTRAINT "KnowledgeVaultChunk_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeVaultChunk" ADD CONSTRAINT "KnowledgeVaultChunk_driveEntryId_fkey" FOREIGN KEY ("driveEntryId") REFERENCES "DriveSyncEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
