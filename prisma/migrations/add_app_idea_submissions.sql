-- Migration: add AppIdeaSubmission table
-- מטרה: מאגר רעיונות אנונימיים שמנויים בחרו לשתף עם הפלטפורמה

CREATE TABLE IF NOT EXISTS "AppIdeaSubmission" (
  "id"          TEXT        NOT NULL,
  "uiSchema"    JSONB       NOT NULL,
  "appName"     TEXT        NOT NULL,
  "appType"     TEXT        NOT NULL,
  "status"      TEXT        NOT NULL DEFAULT 'pending',
  "orgIndustry" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppIdeaSubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AppIdeaSubmission_status_idx"          ON "AppIdeaSubmission"("status");
CREATE INDEX IF NOT EXISTS "AppIdeaSubmission_createdAt_idx"        ON "AppIdeaSubmission"("createdAt");
CREATE INDEX IF NOT EXISTS "AppIdeaSubmission_status_createdAt_idx" ON "AppIdeaSubmission"("status", "createdAt");
