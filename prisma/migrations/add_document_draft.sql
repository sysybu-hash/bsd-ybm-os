-- DocumentDraft — טיוטה אוטומטית של DocumentCreatorWidget.
-- יחיד פעיל אחד למשתמש/ארגון/סוג-מסמך (PUT-style upsert).

CREATE TABLE IF NOT EXISTS "DocumentDraft" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "docType"        TEXT NOT NULL,
  "payload"        JSONB NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentDraft_organizationId_userId_docType_key"
  ON "DocumentDraft" ("organizationId", "userId", "docType");

CREATE INDEX IF NOT EXISTS "DocumentDraft_organizationId_idx"
  ON "DocumentDraft" ("organizationId");

CREATE INDEX IF NOT EXISTS "DocumentDraft_userId_idx"
  ON "DocumentDraft" ("userId");

ALTER TABLE "DocumentDraft" DROP CONSTRAINT IF EXISTS "DocumentDraft_organizationId_fkey";
ALTER TABLE "DocumentDraft" ADD CONSTRAINT "DocumentDraft_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
