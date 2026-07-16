# SLOs — BSD-YBM OS

> עדכון: 2026-07-16 — צ'קליסט הפעלת התראות

## זמינות

| שירות | יעד | חלון |
|--------|-----|------|
| Workspace (Vercel) | 99.5% | 30 יום |
| API ליבה (authenticated) | 99.5% | 30 יום |
| Neon Postgres | 99.9% (ספק) | 30 יום |

## שגיאות

| מדד | יעד | מקור |
|-----|-----|------|
| שיעור 5xx ב-API ליבה | <0.1% | Sentry |
| `session_create_failed` | ירידה שבועית | PostHog |
| `widget_error` (boundary) | <50/יום/org | PostHog |

## ביצועים

| מדד | יעד |
|-----|-----|
| p95 `/api/auth/session` | <500ms |
| p95 routes כבדים (CRM list) | <1s |
| Lighthouse Performance (landing desktop) | ≥90 |

## התראות — צ'קליסט הפעלה (Owner)

סמנו אחרי הגדרה בקונסולה:

- [ ] **Sentry** → Alerts → Error spike / issue rate &gt; 0.5% ב-5 דק׳ על פרויקט `bsd-ybm-os` → מייל/Slack ל-on-call
- [ ] **Sentry Crons** → ודאו שמופיעים monitors לכל slug מ-`withCronGuard` (DSN בפרוד פעיל)
- [ ] **PostHog** → Insight על `session_create_failed` → Alert anomaly
- [ ] **Vercel** → Project Settings → Notifications → Deployment Failed → owner email

| מקור | כלל | קוד / הערה |
|------|-----|------------|
| Sentry Crons | Missed check-in | `lib/cron-guard.ts` → `Sentry.withMonitor` |
| Vercel Cron schedule | UTC | מוניטורים ב-Sentry מוגדרים `Asia/Jerusalem` — ייתכנו false miss; ראו RUNBOOK |

## Error budget

חודשי: 0.5% downtime ≈ 3.6h. מעל התקציב — freeze features, focus reliability.
