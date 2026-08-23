# Disaster Recovery Plan — BSD-YBM OS

> **Version**: 1.0 | **Date**: 2026-05-21
> **Owner**: yohanan.bukshpan
> **Review cadence**: Quarterly + after any P0 incident
> **תרגיל אחרון (חיבור Neon)**: 2026-07-15 — `npm run ops:neon-dr-drill` (reachable, 12 orgs)  
> **PITR קונסולה**: 2026-07-16 — branch `pitr-drill` מ-`production` (past point in time) + `SELECT 1` ב-SQL Editor — עבר; branch נמחק אחרי האימות

---

## 1. Overview

| Metric | Target | Notes |
|--------|--------|-------|
| **RTO** (Recovery Time Objective) | ≤ 4 hours | Time from detection to full service restoration |
| **RPO** (Recovery Point Objective) | ≤ 1 hour | Max data loss acceptable |
| **MTTR** (Mean Time to Repair) | ≤ 2 hours | Average across P0/P1 incidents |

---

## 2. Infrastructure overview

| Component | Provider | DR strategy |
|-----------|----------|-------------|
| Application | Vercel (Edge + Serverless) | Auto-HA; instant rollback via Vercel dashboard |
| Database | Neon PostgreSQL | Point-in-Time Recovery (PITR), 7-day history |
| File storage | Google Drive API (per-org) | Out-of-scope — user-owned data |
| Auth | NextAuth + Neon DB sessions | Covered by DB DR |
| AI services | Gemini / OpenAI / Anthropic | Tri-engine fallback (see §8) |
| Payments | PayPal | External — contact PayPal support |
| CDN / Edge | Vercel Edge Network | Auto-redundant |

---

## 3. Backup strategy

### 3.1 Database (Neon)
- **Automatic PITR**: Neon retains 7-day point-in-time history on paid plans.
- **Branch snapshots**: Create a branch before every major migration:
  ```bash
  # From Neon Console → Branches → Create branch from main
  # Or via Neon CLI:
  neonctl branches create --name "pre-migration-$(date +%Y%m%d)"
  ```
- **Verification drill**: Monthly, restore a copy branch and run `prisma db pull` to confirm schema integrity.

### 3.2 Application code
- All code in Git (GitHub). Protected `main` branch with required PR reviews.
- Vercel auto-deploys on push; every deployment is immutable and reversible.

### 3.3 Secrets / env vars
- Stored in Vercel Environment Variables (not committed to Git).
- Secondary copy in a locked 1Password vault.
- Rotation schedule: API keys every 90 days, NEXTAUTH_SECRET yearly.

---

## 4. Incident severity levels

| Level | Definition | Response SLA | Examples |
|-------|-----------|--------------|---------|
| **P0** | Full service down — no users can log in or use core features | 30 min detect, 4h resolve | DB unreachable, auth broken, build broken in prod |
| **P1** | Core feature broken for >10% users | 1h detect, 8h resolve | AI scan failing, invoice generation broken |
| **P2** | Degraded service — workaround exists | 4h detect, 48h resolve | Slow queries, one widget broken |
| **P3** | Minor issue / cosmetic | Next sprint | UI glitch, typo |

---

## 5. P0 runbook — full service down

### Step 1: Diagnose (0–15 min)
```bash
# Check Vercel deployment status
open https://vercel.com/dashboard

# Check Neon DB status
open https://console.neon.tech

# Check Sentry for errors
open https://sentry.io/organizations/bsd-ybm/issues/?query=is:unresolved

# Check last deployment
vercel list --prod
```

### Step 2: Quick rollback (15–30 min)
If the last deployment is the cause:
```bash
# List recent deployments
vercel list --prod

# Roll back to previous
vercel rollback [deployment-url]
```
Or via Vercel dashboard: Deployments → previous deploy → "Promote to Production".

### Step 3: Database restore (if DB data is corrupted)
```bash
# 1. In Neon Console: create restore branch from last known good timestamp
#    Settings → Restore → select timestamp → Create branch

# 2. Update DATABASE_URL in Vercel to point at the restore branch
#    (temporary, until main branch is fixed)

# 3. Run smoke test:
curl -s https://bsd-ybm.co.il/api/health | jq .

# 4. Notify users via status page
```

### Step 4: Verify restoration
```bash
# Run smoke test suite against production
E2E_BASE_URL=https://bsd-ybm.co.il npx playwright test e2e/site-quality.spec.ts --project=chromium

# Check error rate in Sentry — should be < 1%
# Check PostHog live user activity
```

---

## 6. P1 runbook — AI services down

The app uses a tri-engine fallback: **Gemini → OpenAI → Anthropic → Groq**.

If Gemini is down (most common):
1. OpenAI and Anthropic take over automatically — no manual action needed.
2. Check `GOOGLE_GENERATIVE_AI_API_KEY` quota in Google AI Studio.
3. If OpenAI also down: check `OPENAI_API_KEY` in platform.openai.com.

If ALL AI providers are down (rare):
```bash
# Set DISABLE_AI_FALLBACK=1 in Vercel env vars
# Scan/chat features return a friendly "service unavailable" (503) instead of retrying fallbacks
# IMPLEMENTED — lib/ai-kill-switch.ts · wired in ai-chat, unified-extract, process-document, scan/tri-engine
```

---

## 7. P1 runbook — payment webhooks not arriving

### PayPal
1. Go to PayPal Developer Dashboard → Webhooks.
2. Verify endpoint URL: `https://bsd-ybm.co.il/api/webhooks/paypal`.
3. Resend failed events manually from PayPal dashboard.
4. Check `PAYPAL_WEBHOOK_ID` env var matches the webhook ID in dashboard.

