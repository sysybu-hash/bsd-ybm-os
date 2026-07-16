# SLOs — BSD-YBM OS

> עדכון: 2026-07-16 — צ'קליסט הפעלת התראות + הוראות Owner

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
| Lighthouse Performance (landing mobile) | ≥78 ביניים → ≥90 |

## התראות — צ'קליסט הפעלה (Owner)

לא ניתן ליצור rules ב-Sentry/PostHog מהריפו בלי API token ייעודי. הוראות לחיצה:

### 1. Sentry — Error spike
1. Sentry → Project `bsd-ybm-os` → Alerts → Create Alert
2. Condition: error rate / issue frequency spike (למשל &gt; 0.5% ב-5 דק׳)
3. Action: email / Slack ל-on-call

- [ ] **Sentry** error spike מוגדר

### 2. Sentry Crons
1. ודאו `SENTRY_DSN` בפרוד
2. אחרי הרצת crons — מופיעים monitors לכל slug מ-`withCronGuard`
3. **Timezone:** Vercel Cron = **UTC**; מוניטורים לעיתים `Asia/Jerusalem` — ראו [RUNBOOK.md](./RUNBOOK.md) למניעת false miss. יישור מומלץ: הגדרת monitor schedule ל-UTC תואם `vercel.json`

- [ ] **Sentry Crons** monitors מאומתים (UTC מיושר)

### 3. PostHog — `session_create_failed`
1. PostHog → Insights → event `session_create_failed`
2. Alerts → anomaly / threshold

- [ ] **PostHog** alert מוגדר

### 4. Vercel — Deployment Failed
1. Vercel → Project → Settings → Notifications
2. Enable Deployment Failed → owner email

- [ ] **Vercel** deploy-fail notification מופעל

| מקור | כלל | קוד / הערה |
|------|-----|------------|
| Sentry Crons | Missed check-in | `lib/cron-guard.ts` → `Sentry.withMonitor` |
| Vercel Cron schedule | UTC | תעדו ב-RUNBOOK; יישרו monitors ל-UTC |

## Error budget

חודשי: 0.5% downtime ≈ 3.6h. מעל התקציב — freeze features, focus reliability.
