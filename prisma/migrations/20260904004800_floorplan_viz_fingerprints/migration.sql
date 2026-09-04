-- AlterTable
ALTER TABLE "FloorplanVizRun" ADD COLUMN "extractFingerprint" TEXT;
ALTER TABLE "FloorplanVizRun" ADD COLUMN "inputFingerprint" TEXT;

-- CreateIndex
CREATE INDEX "FloorplanVizRun_organizationId_extractFingerprint_idx" ON "FloorplanVizRun"("organizationId", "extractFingerprint");

-- CreateIndex
CREATE INDEX "FloorplanVizRun_organizationId_inputFingerprint_idx" ON "FloorplanVizRun"("organizationId", "inputFingerprint");
