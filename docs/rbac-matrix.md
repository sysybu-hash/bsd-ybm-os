# RBAC Matrix — BSD-YBM-OS API

מסמך זה מתעד את ההרשאות הנדרשות לכל קבוצת API route ב-`app/api/`. נוצר במסגרת אצווה 8 של פוליש הייצור.

## עקרונות

- כל route ב-`app/api/` עובר דרך אחד מ-3 ה-wrappers ב-[lib/api-handler.ts](../lib/api-handler.ts):
  - `withWorkspacesAuth` — דורש NextAuth session + `organizationId`. ה-context הוא `{ orgId, userId, role }`. ברירת מחדל לרוב routes.
  - `withAdminAuth` — דורש `isAdmin(role)` מ-[lib/is-admin.ts](../lib/is-admin.ts) (PLATFORM_ADMIN / SUPER_ADMIN / ORG_ADMIN). ל-`/api/admin/*`.
  - allowlist — webhook routes ציבוריים (`/api/webhooks/paypal`, `/api/webhooks/payplus`) ו-`/api/auth/*` מטופלים ב-[middleware.ts](../middleware.ts).
- אכיפת ה-RBAC נעשית **בשרת בלבד**. ה-widget guard ב-`PlatformAdminWidget` הוא רק UX, לא אבטחה.
- `scripts/audit-api-routes.mjs` רץ ב-CI ובודק אוטומטית שאין route ללא wrapper.

## מטריצה מקובצת

| קבוצת API | Wrapper | תפקידים מורשים | הערות |
|----------|---------|----------------|------|
| `/api/auth/*` (NextAuth) | allowlist ב-middleware | ציבורי | התחברות/הרשמה — חייב להיות ציבורי |
| `/api/register` | allowlist | ציבורי | יוצר משתמש חדש |
| `/api/webhooks/paypal` | allowlist + signature | PayPal IPN | אימות חתימה ב-route |
| `/api/webhooks/payplus` | allowlist + signature | PayPlus | אימות חתימה ב-route |
| `/api/ai/*` (chat/providers/Gemini) | `withWorkspacesAuth` | כל המשתמשים | בודק quota + rate-limit |
| `/api/analyze`, `/api/analyze-queue/*` | `withWorkspacesAuth` | כל המשתמשים | סריקות AI עם quota |
| `/api/scan/*` | `withWorkspacesAuth` | כל המשתמשים | חיסור scan credit ב-route |
| `/api/erp/*` (documents, archive, quotes, issued-documents, line-items, price-comparison, notebook) | `withWorkspacesAuth` | כל המשתמשים | אכיפת `orgId` ב-WHERE |
| `/api/crm/*` (contacts, import, semantic-search, export) | `withWorkspacesAuth` | כל המשתמשים | |
| `/api/projects/*` (update, detail, [id]/notes) | `withWorkspacesAuth` | כל המשתמשים | |
| `/api/quotes` | `withWorkspacesAuth` | כל המשתמשים | |
| `/api/expenses/confirm` | `withWorkspacesAuth` | כל המשתמשים | |
| `/api/documents/issued/*` (drafts, [id]/export, sign) | `withWorkspacesAuth` | כל המשתמשים | drafts → unique per user |
| `/api/notebooklm/*` (notebooks, chat, audio-overview, from-scan, extract-pdf) | `withWorkspacesAuth` | כל המשתמשים | |
| `/api/meckano/*` (access, employees, projects, reports, reports/export-pdf, zones, clock-in) | `withWorkspacesAuth` + Meckano API key | כל המשתמשים | API key per-org ב-Organization |
| `/api/integrations/*` (google-drive/*, payplus link) | `withWorkspacesAuth` + OAuth token | כל המשתמשים | refresh tokens מוצפנים |
| `/api/os/google-drive/*` | `withWorkspacesAuth` | כל המשתמשים | |
| `/api/os/automations/*` | `withWorkspacesAuth` | כל המשתמשים | |
| `/api/os/assistant/*` (parse-action, interpret) | `withWorkspacesAuth` | כל המשתמשים | |
| `/api/notifications/*` | `withWorkspacesAuth` | כל המשתמשים | filter by userId |
| `/api/organization`, `/api/user/*` | `withWorkspacesAuth` | כל המשתמשים | קריאה/עדכון פרופיל |
| `/api/dashboard/*` | `withWorkspacesAuth` | כל המשתמשים | aggregated org data |
| `/api/reports/*` (finance-csv, finance-pdf) | `withWorkspacesAuth` | כל המשתמשים | |
| `/api/search` | `withWorkspacesAuth` | כל המשתמשים | |
| `/api/sign/[id]` | allowlist + token | ציבורי עם token חתום | חתימה דיגיטלית מקישור email |
| `/api/billing/*` (paypal/capture-order, create-order) | `withWorkspacesAuth` | כל המשתמשים | |
| `/api/telemetry/*` (wizard) | `withWorkspacesAuth` | כל המשתמשים | |
| `/api/org-invite/*`, `/api/organization` | `withWorkspacesAuth` | ORG_ADMIN+ ל-write | mutation routes guard role |
| `/api/admin/*` (logs, subscriptions, users) | `withAdminAuth` | PLATFORM_ADMIN / SUPER_ADMIN / ORG_ADMIN | |
| `/api/assign-user/*` | `withWorkspacesAuth` (role check inside) | ORG_ADMIN | |
| `/api/cron/*` | header `Authorization: Bearer $CRON_SECRET` | Vercel Cron | מוגדר ב-`vercel.json` |
| `/api/debug-session` | `withWorkspacesAuth` | כל המשתמשים | dev-only |
| `/api/chat/*` | `withWorkspacesAuth` | כל המשתמשים | + rate-limit |
| `/api/locale` | allowlist | ציבורי | החלפת cookie locale |

## אכיפה רוחבית

1. **organization isolation** — כל query ב-Prisma חייב לכלול `where: { organizationId: orgId }`. נבדק ידנית ובדוגמת spot.
2. **role escalation** — `provisionUserAction` ו-`updateOrganizationTrade` מאמתים שהמשתמש הנוכחי הוא ORG_ADMIN של אותו ארגון.
3. **rate-limit** — נמצא ב-[lib/rate-limit.ts](../lib/rate-limit.ts) (Postgres-backed). מופעל ב-`/api/chat/legacy`, `/api/notebooklm/chat`, sensitive AI endpoints.
4. **scan credit decrement** — [lib/decrement-scan.ts](../lib/decrement-scan.ts) — חיסור אטומי.

## אימות

```bash
node scripts/audit-api-routes.mjs   # 0 unprotected, 0 leaking
```

נכון לתאריך: דצמבר 2025. שינויים נדרשים כל פעם שמוסיפים route חדש.
