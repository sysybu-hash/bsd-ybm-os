-- AlterTable: optional link from CRM Project to MeckanoZone (same organization)
ALTER TABLE "Project" ADD COLUMN "meckanoZoneId" TEXT;

CREATE INDEX "Project_meckanoZoneId_idx" ON "Project"("meckanoZoneId");

ALTER TABLE "Project" ADD CONSTRAINT "Project_meckanoZoneId_fkey" FOREIGN KEY ("meckanoZoneId") REFERENCES "MeckanoZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
