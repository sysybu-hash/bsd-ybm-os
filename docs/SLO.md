# SLOs — BSD-YBM OS

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
| Lighthouse Performance (landing) | ≥90 |

## התראות

- Sentry: spike 5xx, cron miss
- PostHog: anomaly על `session_create_failed`
- Vercel: deployment failure

## Error budget

חודשי: 0.5% downtime ≈ 3.6h. מעל התקציב — freeze features, focus reliability.
