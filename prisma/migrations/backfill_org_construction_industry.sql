-- הרצה חד־פעמית אחרי הוספת constructionTrade: יישור כל הארגונים למסגרת בנייה (מוצר ממוקד ענף).
-- הרצה: npm run db:execute:backfill-construction

UPDATE "Organization"
SET
  "industry" = 'CONSTRUCTION',
  "constructionTrade" = COALESCE(NULLIF(TRIM("constructionTrade"), ''), 'GENERAL_CONTRACTOR')
WHERE
  "industry" IS DISTINCT FROM 'CONSTRUCTION'
  OR "constructionTrade" IS NULL
  OR TRIM("constructionTrade") = '';
