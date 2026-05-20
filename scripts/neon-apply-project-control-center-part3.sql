-- Neon: הרצה 3 — backfill + רישום Prisma (אחרי part2)

UPDATE "Project" p
SET "primaryContactId" = sub."contactId"
FROM (
  SELECT c."projectId", MIN(c."id") AS "contactId"
  FROM "Contact" c
  WHERE c."projectId" IS NOT NULL
  GROUP BY c."projectId"
  HAVING COUNT(*) = 1
) sub
WHERE p."id" = sub."projectId"
  AND p."primaryContactId" IS NULL;

INSERT INTO "_prisma_migrations" (
  "id", "checksum", "finished_at", "migration_name",
  "logs", "rolled_back_at", "started_at", "applied_steps_count"
)
SELECT gen_random_uuid()::text, 'fce52d30c17e55e05fc08e9e72e1f2f65634713e634a5763c28b42858369ec2a', NOW(),
  '20260520120000_project_control_center', NULL, NULL, NOW(), 1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20260520120000_project_control_center'
);

INSERT INTO "_prisma_migrations" (
  "id", "checksum", "finished_at", "migration_name",
  "logs", "rolled_back_at", "started_at", "applied_steps_count"
)
SELECT gen_random_uuid()::text, 'def4e99b2c80a9853d13c194a7300f2436d5ef80843bb516ac43a94e428e0bfa', NOW(),
  '20260520140000_backfill_project_primary_contact', NULL, NULL, NOW(), 1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20260520140000_backfill_project_primary_contact'
);
