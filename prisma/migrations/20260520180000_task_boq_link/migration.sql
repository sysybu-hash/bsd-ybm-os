ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "linkedBoqLineId" TEXT;
CREATE INDEX IF NOT EXISTS "Task_linkedBoqLineId_idx" ON "Task"("linkedBoqLineId");
