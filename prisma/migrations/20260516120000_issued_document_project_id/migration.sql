-- AlterTable
ALTER TABLE "IssuedDocument" ADD COLUMN "projectId" TEXT;

-- CreateIndex
CREATE INDEX "IssuedDocument_projectId_idx" ON "IssuedDocument"("projectId");

-- AddForeignKey
ALTER TABLE "IssuedDocument" ADD CONSTRAINT "IssuedDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
