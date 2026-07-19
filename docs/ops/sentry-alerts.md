# Sentry alerts — core routes

Configure in Sentry UI (Project → Alerts). No code deploy required.

## Recommended alerts

1. **Dashboard stats errors**
   - Condition: event count where `transaction` contains `/api/dashboard/stats` and level is `error`
   - Threshold: > 5 events in 10 minutes
   - Action: email / Slack to on-call

2. **Analyze queue failures**
   - Condition: event message / transaction contains `analyze-queue` or logger name `analyze-queue`
   - Threshold: > 10 events in 15 minutes

3. **Latency (optional Performance)**
   - P95 for `/api/dashboard/stats` > 2000ms for 15 minutes (Preview/prod as separate environments)

## Environments

- `production` — `bsd-ybm.co.il`
- `preview` — Vercel preview deployments

Tag releases with Vercel git SHA when available.
