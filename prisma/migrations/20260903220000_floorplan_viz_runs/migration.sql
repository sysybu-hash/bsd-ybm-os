-- CreateTable
CREATE TABLE "FloorplanVizRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "sourceFileName" TEXT,
    "planMimeType" TEXT NOT NULL,
    "planBase64" TEXT NOT NULL,
    "layoutJson" JSONB NOT NULL,
    "styleKitJson" JSONB NOT NULL,
    "styleLabelHe" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'overview',
    "photo" BOOLEAN NOT NULL DEFAULT false,
    "enginesJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FloorplanVizRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorplanVizStill" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "viewId" TEXT NOT NULL,
    "viewKey" TEXT NOT NULL,
    "labelHe" TEXT NOT NULL,
    "roomName" TEXT,
    "mimeType" TEXT NOT NULL,
    "dataBase64" TEXT NOT NULL,
    "editPrompt" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FloorplanVizStill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FloorplanVizRun_organizationId_updatedAt_idx" ON "FloorplanVizRun"("organizationId", "updatedAt");

-- CreateIndex
CREATE INDEX "FloorplanVizRun_projectId_idx" ON "FloorplanVizRun"("projectId");

-- CreateIndex
CREATE INDEX "FloorplanVizRun_userId_idx" ON "FloorplanVizRun"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FloorplanVizStill_runId_viewKey_key" ON "FloorplanVizStill"("runId", "viewKey");

-- CreateIndex
CREATE INDEX "FloorplanVizStill_organizationId_idx" ON "FloorplanVizStill"("organizationId");

-- CreateIndex
CREATE INDEX "FloorplanVizStill_runId_idx" ON "FloorplanVizStill"("runId");

-- AddForeignKey
ALTER TABLE "FloorplanVizRun" ADD CONSTRAINT "FloorplanVizRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorplanVizRun" ADD CONSTRAINT "FloorplanVizRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorplanVizRun" ADD CONSTRAINT "FloorplanVizRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorplanVizStill" ADD CONSTRAINT "FloorplanVizStill_runId_fkey" FOREIGN KEY ("runId") REFERENCES "FloorplanVizRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
