# Vercel Environment Variables — BSD-YBM OS 10/10

> **Last updated**: 2026-07-31  
> Apply to **Production** and **Preview** separately. Preview must use an isolated Neon branch.  
> **Audit 2026-07-16:** Production + Preview — `CRON_SECRET` (synced), `SENTRY_DSN`, `CSP_STRICT=true` (Preview + Development). Production also has DB/Auth/AI/PostHog/`PAYPAL_CLIENT_ID`.

## Database

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes (Production) | Neon **production** pooled connection |
| `DIRECT_URL` | Yes (Production) | Neon **production** direct (migrations) |
| `DATABASE_URL` | Yes (Preview) | Neon **preview** branch pooled — **never** production |
| `DIRECT_URL` | Yes (Preview) | Neon **preview** branch direct |
| `PREVIEW_DATABASE_URL` | Local push script | Used by `scripts/vercel-push-env-from-local.mjs` for Preview only |
| `PREVIEW_DIRECT_URL` | Local push script | Preview direct URL for the push script |

**Forbidden:** copying Production `DATABASE_URL` into the Preview environment. Verify with `node scripts/verify-preview-db-isolation.mjs`.

## Auth

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXTAUTH_SECRET` | Yes | Same as `AUTH_SECRET` if used |
| `AUTH_SECRET` | Yes | NextAuth v5 |
| `NEXTAUTH_URL` | Yes | Production canonical URL |
| `AUTH_URL` | Yes | Same as public app URL |
| `OS_ADMIN_EMAIL` / `OS_ADMIN_EMAILS` | **Yes in Production** | Platform super-admins. Fail-closed if unset in production (no hardcoded emails). |

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
- `20260731160000_issued_document_sequence` — **required before** document-number allocator code (table `IssuedDocumentSequence`)

```bash
npm run db:migrate:prod   # Production (loads .env.local / DIRECT_URL)
npx prisma migrate status
```

## Hardening closeout (owner)

| Gate | Action | Verify |
|------|--------|--------|
| Preview DB | Neon branch `preview` → Vercel Preview `DATABASE_URL`/`DIRECT_URL` only | `npm run ops:verify-preview-db` |
| OS admins | Set `OS_ADMIN_EMAILS` on Production | Platform admin after redeploy |
| Google link URI | Add `https://www.bsd-ybm.co.il/api/auth/google-link/callback` in Google Cloud Console | Settings → Connect Google for sign-in |
| CSP | `CSP_STRICT=true` on Preview → smoke → Production | [csp-production-checklist.md](./csp-production-checklist.md) |

See also [RUNBOOK.md](./RUNBOOK.md) Google OAuth redirect URIs.

## Cron paths (14) — `vercel.json`

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
14. `/api/cron/monthly-health-report` — 1st of month 08:00 UTC  

