-- ידני / פריסה: הוספת עמודת התמחות בענף הבנייה (אם עדיין לא קיימת ב-DB)
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "constructionTrade" TEXT NOT NULL DEFAULT 'GENERAL_CONTRACTOR';

-- יישור ענף ישן לבנייה (אופציונלי — הרץ רק אחרי גיבוי ובדיקה)
-- UPDATE "Organization" SET "industry" = 'CONSTRUCTION' WHERE "industry" IS NOT NULL AND "industry" <> 'CONSTRUCTION';
