# רשימת בדיקות QA — BSD-YBM OS

**סטטוס:** 10/10 — API ייעודי, i18n בווידג'טים, PostHog (`widget_opened`, `scan_started`, `scan_completed`, `automation_executed`, `pdf_exported`), WidgetState, E2E אוטומטי, `verify` + seed.

**ידני בלבד:** מובייל (תפריט תחתון, «עוד», גלילה), PDF עברית RTL בפרודקשן, סריקת PDF אמיתית עם DocAI/OpenAI.

## שלושת ערוצי האוטומציה

| פקודה לדוגמה | Omnibar (Enter) | AiChat (parse-action) | Gemini Live (tool) |
|--------------|-----------------|----------------------|-------------------|
| פתח סורק | ☑ E2E | ידני | ידני |
| פתח דאשבורד | ידני | ידני | ידני |
| צור חשבונית | ☑ E2E | ידני | ידני |
| נקה פריסה | ידני | ידני | ידני |
| מחליף חלונות (Ctrl+Alt+Tab) | ☑ E2E | N/A | ידני |

**AiChat:** שאלה כללית נשארת בצ'אט (לא פותחת סורק) — ☑ E2E.

## מובייל

- [ ] תפריט תחתון + Omnibar (מיקרופון מרכזי)
- [ ] כפתור «חלונות» פותח מחליף חלונות — ☑ E2E (mobile-chrome)
- [ ] «עוד» מציג את יישומי הסיידבר
- [ ] אין גלילה אופקית (`scrollWidth ≤ clientWidth`)

## מסמכים

- [ ] הפקת חשבונית → הורדת PDF בעברית תקינה (RTL, לא הפוך)
- [ ] ייצוא מ-API: `/api/documents/issued/[id]/export?format=pdf`

## API (מיגרציה מ-`/api/data`)

| נתיב ייעודי | שימוש |
|-------------|--------|
| `GET /api/dashboard/stats` | דאשבורד |
| `GET /api/projects` | רשימת פרויקטים |
| `GET /api/projects/detail?query=` | ווידג'ט פרויקט |
| `GET/POST /api/projects/[id]/notes` | הערות פרויקט |
| `GET /api/notifications/feed` | מרכז התראות |
| `POST /api/expenses/confirm` | אישור הוצאה |
| `GET/POST /api/crm/contacts` | CRM / יוצר מסמכים |
| `GET /api/organization` | הגדרות ארגון ביוצר מסמכים |

`/api/data` נשאר לתאימות לאחור בלבד.

## CI (GitHub Actions — `quality-gate.yml`)

| שלב | אוטומטי ב-CI |
|-----|----------------|
| `npm run lint` | כן |
| `npx tsc --noEmit` | כן |
| `npm test` (Jest, כולל tri-engine / סורק) | כן |
| `node scripts/audit-api-routes.mjs` | כן |
| `npm run build` | כן |
| `npm run test:e2e:quality` | כן |
| `npm run test:e2e:workspace` (אחרי seed) | כן |

## CI מקומי

```bash
npm run verify          # lint + tsc + jest
npm run verify:e2e:seeded   # seed + playwright
npm run premerge        # verify:all
node scripts/audit-api-routes.mjs
```

## E2E אוטומטי (Playwright)

```bash
npm run seed:test
E2E_EMAIL=owner@bsd-demo.test E2E_PASSWORD=Demo!2026 npm run verify:e2e:seeded
```

קבצים: `e2e/workspace-automations.spec.ts`, `e2e/workspace-a11y.spec.ts`.

## נגישות (axe)

```bash
npm run seed:test
E2E_EMAIL=owner@bsd-demo.test E2E_PASSWORD=Demo!2026 playwright test e2e/workspace-a11y.spec.ts --project=chromium
```

## Lighthouse baseline

```bash
npm run lighthouse:sample
```

## פרודקשן

```bash
npx prisma migrate deploy
```

הגדר `NEXT_PUBLIC_POSTHOG_KEY` (ו־`NEXT_PUBLIC_POSTHOG_HOST` אם נדרש) ב־Vercel, ואז `vercel deploy --prod`.

PostHog בקוד: `$pageview` בניווט (App Router), `identify` למשתמש מחובר, `reset` ביציאה.
