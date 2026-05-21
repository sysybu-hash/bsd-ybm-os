# BSD-YBM Intelligence — Production Runbook

> **Last updated**: 2026-05-21  
> This document is for **on-call engineers and deployment owners**.  
> For architecture details see `docs/ARCHITECTURE.md`.  
> For onboarding see `docs/ONBOARDING.md`.

---

## Table of Contents

1. [Deployment](#1-deployment)
2. [Environment Variables](#2-environment-variables)
3. [Database Operations](#3-database-operations)
4. [Monitoring & Alerts](#4-monitoring--alerts)
5. [Incident Response](#5-incident-response)
6. [Cron Job Health](#6-cron-job-health)
7. [Payment Webhooks](#7-payment-webhooks)
8. [Rollback Procedure](#8-rollback-procedure)
9. [Backup & Recovery](#9-backup--recovery)
10. [Common Ops Tasks](#10-common-ops-tasks)

---

## 1. Deployment

### Normal Deploy

```bash
git push origin main
# Vercel auto-deploys; monitor at https://vercel.com/dashboard
```

### Pre-deploy Checks (mandatory)

```bash
npm run lint          # ESLint — must be 0 warnings
npx tsc --noEmit      # TypeScript — must be 0 errors
npm test              # Unit tests
npx prisma migrate status  # Confirm no pending migrations
```

### Deploy With Migration

```bash
# 1. Create and review migration locally
npx prisma migrate dev --name describe_change

# 2. Push migration first (before code)
npx prisma migrate deploy

# 3. Then deploy code
git push origin main
```

> ⚠️ **Never deploy code that requires a new schema column before running the migration.**  
> Neon supports zero-downtime schema changes (ADD COLUMN with DEFAULT is instant).

### Preview Deployments

Every PR gets a Vercel Preview URL. Preview environments:
- Have `VERCEL_ENV=preview` (bots blocked in robots.txt)
- Use the **same production database** unless `DATABASE_URL` is overridden
- Use real external APIs — be careful with payment testing

---

## 2. Environment Variables

### Audit Command

```bash
node scripts/check-env-essential.mjs
```

Outputs a colored table of all 90 vars: `✓ OK` / `⚠ WARN` / `✗ MISSING` / `– optional`.

### Critical Variables

| Variable | What happens if missing |
|---|---|
| `DATABASE_URL` | Build fails at prisma generate |
| `NEXTAUTH_SECRET` or `AUTH_SECRET` | All auth broken — 500 on every page |
| `GEMINI_API_KEY` | AI scan/chat degraded to OpenAI fallback |
| `CRON_SECRET` | Cron routes return 401 — jobs don't run |
| `SENTRY_DSN` | Errors not captured (app still works) |
| `PAYPAL_WEBHOOK_ID` | PayPal webhooks rejected — manual payment marking needed |
| `PAYPLUS_SECRET_KEY` | PayPlus webhooks rejected in prod — payments not auto-applied |

### Rotating a Secret

1. Generate new value
2. Update in Vercel dashboard → Settings → Environment Variables
3. Trigger a redeploy: `vercel --prod` or push a dummy commit
4. If rotating `NEXTAUTH_SECRET`: **all existing sessions are invalidated** — users will be logged out

---

## 3. Database Operations

### Connect to Neon

```bash
# Install psql or use Neon's web console
psql "$DATABASE_URL"
```

### Run Pending Migrations

```bash
npx prisma migrate deploy
```

### Reset Database (dev only!)

```bash
npx prisma migrate reset  # ⚠️ DELETES ALL DATA
```

### Schema Status Check

```bash
npx prisma migrate status
```

### Common Queries

```sql
-- Check pending scan jobs
SELECT status, COUNT(*) FROM "DocumentScanJob"
GROUP BY status ORDER BY status;

-- Check recent rate limit hits
SELECT key, COUNT(*) FROM "RateLimit"
WHERE "windowStart" > NOW() - INTERVAL '1 hour'
GROUP BY key ORDER BY COUNT(*) DESC LIMIT 20;

-- Check active subscriptions
SELECT o.name, b."planId", b."status"
FROM "OSBillingConfig" b
JOIN "Organization" o ON b."organizationId" = o.id
WHERE b."status" = 'active';

-- Recent PayPlus transactions
SELECT id, status, "paidAt", "payplusTransactionId"
FROM "Invoice"
WHERE "payplusTransactionId" IS NOT NULL
ORDER BY "paidAt" DESC LIMIT 10;
```

---

## 4. Monitoring & Alerts

### Sentry

- Dashboard: https://sentry.io (project: `bsd-ybm-os`)
- Error threshold alerts: `P95 > 2s` or `error rate > 1%`
- Cron monitors: check each cron job health at Sentry → Crons

**Key alert conditions to set:**
- Any `500` error rate > 0.5% over 5 minutes
- Cron job missed check-in
- `webhook_rejected` event in any webhook route

### PostHog

- Dashboard: https://app.posthog.com
- Key events: `$exception`, `client_log`, `cron_success`, `cron_failure`

### Vercel Logs

```bash
# Stream live logs (requires Vercel CLI)
vercel logs --follow

# Filter by function
vercel logs --follow --filter "api/webhooks"
```

---

## 5. Incident Response

### P0 — Site Down

1. Check Vercel status page: https://www.vercel-status.com/
2. Check Neon status: https://neonstatus.com/
3. Check Sentry for spike in errors
4. If DB issue: check `DATABASE_URL` is set correctly in Vercel env
5. Rollback: see [Section 8](#8-rollback-procedure)

### P1 — Payments Not Processing

1. Check PayPal/PayPlus status pages
2. Check `/api/webhooks/paypal` and `/api/webhooks/payplus` logs in Sentry
3. Verify `PAYPAL_WEBHOOK_ID` is set and correct
4. Verify `PAYPLUS_SECRET_KEY` is set and not rotated on PayPlus side
5. Check Sentry for `payplus_webhook_rejected` or `paypal_webhook_rejected` events
6. **Manual fallback**: find the transaction in PayPlus/PayPal dashboard, manually update `Invoice.status = 'PAID'` in DB

### P1 — AI Features Degraded

1. Check Gemini API status: https://status.cloud.google.com/
2. Check `GEMINI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` is set
3. If Gemini is down: system should auto-fallback to OpenAI (check `OPENAI_API_KEY`)
4. Check scan queue: `SELECT status, COUNT(*) FROM "DocumentScanJob" GROUP BY status`
5. If queue is stuck: manually re-queue with `status = 'pending'` update

### P2 — Auth Issues

1. Check `NEXTAUTH_SECRET` / `AUTH_SECRET` is set
2. Check `NEXTAUTH_URL` matches the actual domain (no trailing slash)
3. Check Neon for session table: `SELECT COUNT(*) FROM "Session" WHERE expires > NOW()`
4. If passkeys broken: check `WEBAUTHN_RP_ID` matches domain exactly

---

## 6. Cron Job Health

All crons are monitored via **Sentry Crons**. If a cron misses its window:

```bash
# Manual trigger (replace URL and CRON_SECRET)
curl -X GET https://bsd-ybm.co.il/api/cron/financial-insights \
  -H "Authorization: Bearer $CRON_SECRET"
```

| Cron | Path | Manual Trigger |
|---|---|---|
| Financial Insights | `/api/cron/financial-insights` | GET with auth header |
| Analyze Queue | `/api/analyze-queue/process` | GET or POST with auth header |
| Task Reminders | `/api/cron/task-reminders` | GET with auth header |
| Collection Reminders | `/api/cron/collection-reminders` | GET with auth header |
| Work Diary Push | `/api/cron/work-diary-push` | GET with auth header |

**If a cron is consistently failing:**
1. Check Sentry for the `cron_failure` event and its `error` field
2. Check if `CRON_SECRET` is set in Vercel env
3. Check if the underlying service (Gemini, Neon, email) is operational

---

## 7. Payment Webhooks

### PayPal Webhook Setup

In PayPal Developer Dashboard → Webhooks:
1. Endpoint URL: `https://bsd-ybm.co.il/api/webhooks/paypal`
2. Events: `PAYMENT.CAPTURE.COMPLETED`
3. Copy the **Webhook ID** → set `PAYPAL_WEBHOOK_ID` in Vercel env

### PayPlus Webhook Setup

In PayPlus dashboard → Settings → Webhooks:
1. Endpoint URL: `https://bsd-ybm.co.il/api/webhooks/payplus`
2. The shared secret should match `PAYPLUS_SECRET_KEY`
3. Events: payment completion (IPN)

### Testing Webhooks Locally

```bash
# Use Vercel CLI to tunnel local server
vercel dev

# Then use PayPal Sandbox / PayPlus test mode
# Or use ngrok: ngrok http 3000
```

---

## 8. Rollback Procedure

### Code Rollback

```bash
# Option A: Revert via git
git revert HEAD --no-edit
git push origin main

# Option B: Vercel instant rollback
# Go to Vercel dashboard → Deployments → pick previous → Promote to Production
```

### Database Rollback

Each Prisma migration has a corresponding `down` SQL:

```bash
# Check current migration state
npx prisma migrate status

# If a migration needs to be rolled back manually:
# 1. Run the down SQL against Neon
# 2. Delete the migration record:
psql "$DATABASE_URL" -c "DELETE FROM _prisma_migrations WHERE migration_name = '20240101_migration_name';"
# 3. Run prisma migrate deploy to re-sync
```

> ⚠️ **Always test down-migrations in a staging environment first.**

---

## 9. Backup & Recovery

### Neon Automatic Backups

Neon provides **point-in-time recovery (PITR)** up to 7 days (Free) / 30 days (Pro):

1. Go to Neon Console → Project → Branches
2. Create a new branch from a historical point: "Create branch at time"
3. Test recovery on the branch
4. If needed: dump from branch and restore to main

```bash
# Dump from recovery branch
pg_dump "$RECOVERY_BRANCH_URL" > backup.sql

# Restore to main (⚠️ destructive — coordinate with team first)
psql "$DATABASE_URL" < backup.sql
```

### Manual Backup

```bash
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-acl \
  --no-owner \
  -f "backup-$(date +%Y%m%d-%H%M).dump"
```

---

## 10. Common Ops Tasks

### Clear Document Scan Queue

```sql
-- Re-queue all stuck jobs
UPDATE "DocumentScanJob"
SET status = 'pending', "errorMessage" = NULL, "attempts" = 0
WHERE status = 'processing'
  AND "updatedAt" < NOW() - INTERVAL '30 minutes';
```

### Force-refresh a User's Session

```sql
-- Delete user's session (they will be re-prompted to log in)
DELETE FROM "Session"
WHERE "userId" = 'USER_ID_HERE';
```

### Disable a Cron Job Temporarily

In `vercel.json`, comment out the cron entry and redeploy:

```json
"crons": [
  // { "path": "/api/cron/financial-insights", "schedule": "0 6 * * *" },
]
```

### Check Build Log for Prebuild Issues

```bash
# Run prebuild locally
node scripts/prebuild.mjs

# Run individual prebuild steps
npm run prebuild:1   # ensure-production-schema
npm run prebuild:2   # env:check
npm run prebuild:3   # embed-pdf-fonts
npm run prebuild:4   # prisma-generate-safe
```

### View Rate Limit State

```sql
SELECT key, hits, "windowStart"
FROM "RateLimit"
WHERE "windowStart" > NOW() - INTERVAL '5 minutes'
ORDER BY hits DESC;
```

### Grant Admin Access

```bash
# Add email to ADMIN_EMAILS env var in Vercel (comma-separated)
# ADMIN_EMAILS=email1@domain.com,email2@domain.com
```
