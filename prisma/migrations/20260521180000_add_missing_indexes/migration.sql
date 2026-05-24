-- Migration: add_missing_indexes
-- Adds indexes identified in DB audit.
-- NOTE: CONCURRENTLY removed — Prisma wraps migrations in transactions and
--       CREATE INDEX CONCURRENTLY cannot run inside a transaction block.

-- Quote indexes
CREATE INDEX IF NOT EXISTS "Quote_organizationId_idx"
  ON "Quote" ("organizationId");

CREATE INDEX IF NOT EXISTS "Quote_contactId_idx"
  ON "Quote" ("contactId");

CREATE INDEX IF NOT EXISTS "Quote_organizationId_status_idx"
  ON "Quote" ("organizationId", "status");

CREATE INDEX IF NOT EXISTS "Quote_organizationId_createdAt_idx"
  ON "Quote" ("organizationId", "createdAt");

-- Task compound index (task-reminders cron: WHERE organizationId=? AND status<>'DONE' AND dueDate<?)
CREATE INDEX IF NOT EXISTS "Task_organizationId_status_dueDate_idx"
  ON "Task" ("organizationId", "status", "dueDate");

-- IssuedDocument (collection-reminders cron: WHERE status='PENDING' AND dueDate<NOW())
CREATE INDEX IF NOT EXISTS "IssuedDocument_status_dueDate_idx"
  ON "IssuedDocument" ("status", "dueDate");

-- Session userId + expires (NextAuth: delete expired sessions, user session lookup)
CREATE INDEX IF NOT EXISTS "Session_userId_idx"
  ON "Session" ("userId");

CREATE INDEX IF NOT EXISTS "Session_expires_idx"
  ON "Session" ("expires");
