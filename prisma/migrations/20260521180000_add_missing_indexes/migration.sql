-- Migration: add_missing_indexes
-- Adds indexes identified in DB audit:
--   1. Quote: organizationId, contactId, (organizationId,status), (organizationId,createdAt)
--   2. Task: compound (organizationId,status,dueDate) for task-reminders cron
--   3. IssuedDocument: (status,dueDate) for collection-reminders cron
--   4. Session: userId + expires for NextAuth session queries

-- Quote indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Quote_organizationId_idx"
  ON "Quote" ("organizationId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Quote_contactId_idx"
  ON "Quote" ("contactId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Quote_organizationId_status_idx"
  ON "Quote" ("organizationId", "status");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Quote_organizationId_createdAt_idx"
  ON "Quote" ("organizationId", "createdAt");

-- Task compound index (task-reminders cron: WHERE organizationId=? AND status<>'DONE' AND dueDate<?)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_organizationId_status_dueDate_idx"
  ON "Task" ("organizationId", "status", "dueDate");

-- IssuedDocument (collection-reminders cron: WHERE status='PENDING' AND dueDate<NOW())
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IssuedDocument_status_dueDate_idx"
  ON "IssuedDocument" ("status", "dueDate");

-- Session userId + expires (NextAuth: delete expired sessions, user session lookup)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Session_userId_idx"
  ON "Session" ("userId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Session_expires_idx"
  ON "Session" ("expires");
