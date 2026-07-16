# פריסה ומיגרציות DB

## משתני סביבה מומלצים (פרודקשן)

- `CRON_SECRET` — `/api/cron/*`
- `ANALYZE_QUEUE_SECRET` — worker של `analyze-queue/process`
- `ITA_PRODUCTION_KEY` + `ITA_API_URL` — הקצאה חיה; בלי URL: hard-fail; mock רק עם `ALLOW_ITA_MOCK`
- `CSP_STRICT` — `true` ב-Preview וב-Production
- `DISABLE_AI_FALLBACK` — כיבוי AI בחירום (503)
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_*` — חיוב Stripe (אופציונלי)
- `USE_PGVECTOR=true` — אחרי migrate עם הרחבת vector
- `MPP_CONVERT_URL` — שירות המרת `.mpp` → XML

## Prisma

1. ודאו שכל תיקיות `prisma/migrations/*` במעקב git.
2. בפרודקשן: `npx prisma migrate deploy` (עם `DATABASE_URL` של הסביבה).
3. לאחר מיגרציה: `npx prisma generate` (גם ב-build).

### מיגרציה: `issued_document.project_id`

`prisma/migrations/20260516120000_issued_document_project_id` — שדה `projectId` על מסמכים מונפקים. חובה להריץ בפרוד לפני שימוש בשיוך פרויקט / אוטומציה `assign_document_project`.

## SQL ידני

קבצים תחת `prisma/migrations/manual_*.sql` אינם מופעלים אוטומטית ע״י `migrate deploy`. הריצו אותם במפורש לפי הצורך (ראו `package.json` → `db:execute:*`).
