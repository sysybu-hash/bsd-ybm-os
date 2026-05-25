-- CreateEnum
CREATE TYPE "FieldCopilotSessionStatus" AS ENUM ('DRAFT', 'ANALYZING', 'READY', 'HANDED_OFF', 'ARCHIVED');

-- CreateTable
CREATE TABLE "FieldCopilotSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactId" TEXT,
    "projectId" TEXT,
    "contactName" TEXT,
    "projectName" TEXT,
    "constructionTrade" TEXT,
    "transcript" TEXT,
    "userNotes" TEXT,
    "videoAssetId" TEXT,
    "analysisJson" JSONB,
    "scopeSummary" TEXT,
    "assumptionsJson" JSONB NOT NULL DEFAULT '[]',
    "status" "FieldCopilotSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "handedOffAt" TIMESTAMP(3),
    "issuedDocumentId" TEXT,
    "quoteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldCopilotSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldCopilotAsset" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dataBase64" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldCopilotAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FieldCopilotSession_organizationId_userId_idx" ON "FieldCopilotSession"("organizationId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FieldCopilotSession_organizationId_status_idx" ON "FieldCopilotSession"("organizationId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FieldCopilotSession_organizationId_createdAt_idx" ON "FieldCopilotSession"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FieldCopilotAsset_sessionId_idx" ON "FieldCopilotAsset"("sessionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FieldCopilotAsset_organizationId_idx" ON "FieldCopilotAsset"("organizationId");

-- AddForeignKey
ALTER TABLE "FieldCopilotSession" ADD CONSTRAINT "FieldCopilotSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldCopilotSession" ADD CONSTRAINT "FieldCopilotSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldCopilotAsset" ADD CONSTRAINT "FieldCopilotAsset_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "FieldCopilotSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
