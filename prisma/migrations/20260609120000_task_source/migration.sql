-- Add `source` to Task so the Gantt agent can identify and replace its own
-- generated tasks (AI_GANTT) without touching MANUAL ones.
ALTER TABLE "Task"
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'MANUAL';

-- Index the gantt-agent replace path: deleteMany by (projectId, source).
-- Neon has no shadow DB; create the index defensively and only if the table exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Task'
  ) THEN
    CREATE INDEX IF NOT EXISTS "Task_projectId_source_idx"
      ON "Task"("projectId", "source");
  END IF;
END $$;
