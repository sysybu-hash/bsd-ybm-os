-- Backfill primaryContactId when a project has exactly one linked contact
UPDATE "Project" p
SET "primaryContactId" = sub."contactId"
FROM (
  SELECT c."projectId", MIN(c."id") AS "contactId", COUNT(*)::int AS cnt
  FROM "Contact" c
  WHERE c."projectId" IS NOT NULL
  GROUP BY c."projectId"
  HAVING COUNT(*) = 1
) sub
WHERE p."id" = sub."projectId"
  AND p."primaryContactId" IS NULL;
