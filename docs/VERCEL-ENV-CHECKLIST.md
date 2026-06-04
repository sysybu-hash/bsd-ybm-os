# Vercel Environment Variables — BSD-YBM OS 10/10

> **Last updated**: 2026-06-04  
> Apply to **Production** and **Preview** before `npm run db:migrate` on each environment.

## Database

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Neon pooled connection |
| `DIRECT_URL` | Yes | Neon direct (migrations) |

## Auth

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXTAUTH_SECRET` | Yes | Same as `AUTH_SECRET` if used |
| `AUTH_SECRET` | Yes | NextAuth v5 |
| `NEXTAUTH_URL` | Yes | Production canonical URL |
| `AUTH_URL` | Yes | Same as public app URL |

## AI / Embeddings

| Variable | Required | Notes |
|----------|----------|-------|
| `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` | Yes | BOQ agent, embeddings, tri-engine |
| `OPENAI_API_KEY` | Optional | Tri-engine fallback |
| `ANTHROPIC_API_KEY` | Optional | Tri-engine fallback |

## Payments

| Variable | Required | Notes |
|----------|----------|-------|
| `PAYPAL_CLIENT_ID` | Billing | Server + `NEXT_PUBLIC_PAYPAL_CLIENT_ID` |
| `PAYPAL_CLIENT_SECRET` | Billing | Server only |
| `PAYPAL_WEBHOOK_ID` | Webhooks | Signature verification |
| `PAYPAL_ENV` | Billing | `sandbox` or `live` |
| PayPlus vars | Billing | Per `lib/env.ts` / PayPlus dashboard |

## Email

| Variable | Required | Notes |
|----------|----------|-------|
| `RESEND_API_KEY` | Growth | Lifecycle + leads |
| SMTP vars | Optional | If not using Resend |

## Cron

| Variable | Required | Notes |
|----------|----------|-------|
| `CRON_SECRET` | Yes | Bearer for all `/api/cron/*` and analyze-queue process |

## Analytics

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_POSTHOG_KEY` | Prod | Client capture |
| `NEXT_PUBLIC_POSTHOG_HOST` | Prod | EU/US host |
| `POSTHOG_API_KEY` | Server | Funnel server events |

## Security (staging → production)

| Variable | Required | Notes |
|----------|----------|-------|
| `CSP_STRICT` | Preview first | `true` removes `unsafe-eval` from CSP |

## Migrations to apply after env

- `20260604140000_contact_search_embedding`
- `20260604160000_knowledge_vault_chunk`

```bash
npm run db:migrate:prod   # Production (Vercel env loaded locally or CI)
```

## Cron paths (11) — `vercel.json`

Verify in Vercel Dashboard → Cron Jobs:

1. `/api/cron/financial-insights` — 06:00 UTC  
2. `/api/analyze-queue/process` — 06:15 UTC  
3. `/api/cron/task-reminders` — 07:00 UTC  
4. `/api/cron/cashflow-guardian` — 08:00 UTC  
5. `/api/cron/collection-reminders` — Sun 08:00 UTC  
6. `/api/cron/work-diary-push` — 16:00 UTC  
7. `/api/cron/field-copilot-followups` — 08:00 UTC  
8. `/api/cron/meckano-sync` — 05:00 UTC  
9. `/api/cron/google-calendar-sync` — 04:00 UTC  
10. `/api/cron/google-calendar-push` — 04:30 UTC  
11. `/api/cron/email-digest` — 09:00 UTC  
12. `/api/cron/lifecycle-emails` — 10:00 UTC  
13. `/api/cron/contact-embeddings` — Sun 03:00 UTC  
