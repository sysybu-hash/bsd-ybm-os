-- ═══════════════════════════════════════════════════════════════════════════
-- הרצה ב-Neon: SQL Editor → בחר branch production + DB neondb → הדבק והרץ (Run).
-- אם `npx prisma db push` נכשל ב-P1001 מהמחשב — זה מסנכרן את הסכמה והנתונים בלי טרמינל.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) עמודת התמחות בענף הבנייה (אם חסרה)
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "constructionTrade" TEXT NOT NULL DEFAULT 'GENERAL_CONTRACTOR';

-- 2) יישור ארגונים לענף CONSTRUCTION + constructionTrade תקין
UPDATE "Organization"
SET
  "industry" = 'CONSTRUCTION',
  "constructionTrade" = COALESCE(NULLIF(TRIM("constructionTrade"), ''), 'GENERAL_CONTRACTOR')
WHERE
  "industry" IS DISTINCT FROM 'CONSTRUCTION'
  OR "constructionTrade" IS NULL
  OR TRIM("constructionTrade") = '';

COMMIT;
