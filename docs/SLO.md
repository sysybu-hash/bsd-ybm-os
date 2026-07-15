# SLOs — BSD-YBM OS

> עדכון: 2026-07-15 — התראות מחוברות / מתועדות לחיבור

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

## התראות (מחוברות / להפעיל בקונסולה)

| מקור | כלל | סטטוס |
|------|-----|--------|
| Sentry | Spike 5xx / error rate &gt; 0.5% ב-5 דק׳ | להגדיר ב-Sentry Alerts על פרויקט `bsd-ybm-os` |
| Sentry Crons | Missed check-in לכל `withCronGuard` slug | מופעל בקוד דרך `Sentry.withMonitor` — ודאו DSN בפרוד |
| PostHog | Anomaly על `session_create_failed` | Insights → Alert |
| Vercel | Deployment failure | הודעות פרויקט `bsd-ybm-os` ל-owner |

## Error budget

חודשי: 0.5% downtime ≈ 3.6h. מעל התקציב — freeze features, focus reliability.
