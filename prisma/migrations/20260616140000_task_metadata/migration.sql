-- Add structured metadata column for kanban/gantt task fields (client, budget, etc.)
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "metadata" JSONB DEFAULT '{}'::jsonb;
