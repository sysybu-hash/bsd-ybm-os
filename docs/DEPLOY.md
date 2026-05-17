# פריסה ומיגרציות DB

## Prisma

1. ודאו שכל תיקיות `prisma/migrations/*` במעקב git.
2. בפרודקשן: `npx prisma migrate deploy` (עם `DATABASE_URL` של הסביבה).
3. לאחר מיגרציה: `npx prisma generate` (גם ב-build).

### מיגרציה: `issued_document.project_id`

`prisma/migrations/20260516120000_issued_document_project_id` — שדה `projectId` על מסמכים מונפקים. חובה להריץ בפרוד לפני שימוש בשיוך פרויקט / אוטומציה `assign_document_project`.

## SQL ידני

קבצים תחת `prisma/migrations/manual_*.sql` אינם מופעלים אוטומטית ע״י `migrate deploy`. הריצו אותם במפורש לפי הצורך (ראו `package.json` → `db:execute:*`).
