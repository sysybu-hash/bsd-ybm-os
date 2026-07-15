# Disaster Recovery Plan — BSD-YBM OS

> **Version**: 1.0 | **Date**: 2026-05-21
> **Owner**: yohanan.bukshpan
> **Review cadence**: Quarterly + after any P0 incident
> **תרגיל אחרון (חיבור Neon)**: 2026-07-15 — `npm run ops:neon-dr-drill` (reachable, 12 orgs)  
> **PITR מלא בקונסולה**: רבעוני — Owner מבצע branch מ-PITR לפי §3; מעדכן תאריך כאן אחרי השלמה

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
| Payments | PayPal / PayPlus | External — contact PayPal support |
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
# Temporarily set DISABLE_AI_FALLBACK=1 in Vercel env vars
# This causes scan/chat features to return a friendly "service unavailable" instead of infinite retrying
# NOT YET IMPLEMENTED — add to backlog
```

---

## 7. P1 runbook — payment webhooks not arriving

### PayPal
1. Go to PayPal Developer Dashboard → Webhooks.
2. Verify endpoint URL: `https://bsd-ybm.co.il/api/webhooks/paypal`.
3. Resend failed events manually from PayPal dashboard.
4. Check `PAYPAL_WEBHOOK_ID` env var matches the webhook ID in dashboard.

### PayPlus (Israeli)
1. Log in to PayPlus merchant portal.
2. Verify endpoint URL: `https://bsd-ybm.co.il/api/webhooks/payplus`.
3. Verify `PAYPLUS_SECRET_KEY` matches.
4. Check Sentry for 401 errors → indicates HMAC mismatch.

---

## 8. AI engine fallback architecture

```
User request
     │
     ▼
Gemini 2.5 Flash ──(quota/error)──► Gemini 2.0 Flash
                                         │
                                    (quota/error)
                                         ▼
                                    OpenAI GPT-4o
                                         │
                                    (quota/error)
                                         ▼
                                    Anthropic Claude
                                         │
                                    (quota/error)
                                         ▼
                                    Groq Llama
                                         │
                                    (all fail)
                                         ▼
                                    503 error to user
```

Fallback logic: `lib/gemini-model.ts` → `isLikelyGeminiModelUnavailable()`.

---

## 9. Data retention and deletion

| Data type | Retention | Deletion trigger |
|-----------|-----------|-----------------|
| User accounts | Until deletion request | User requests account deletion via Settings |
| Scan documents | 90 days (configurable) | Automated cron: `app/api/cron/cleanup-old-scans` |
| Audit logs | 1 year | Manual (admin) |
| Sessions | 30 days (inactivity) | NextAuth session cleanup |
| Issued documents | 7 years (legal, IL) | Manual only |

---

## 10. Communication during incidents

| Audience | Channel | Template |
|----------|---------|----------|
| All users | Status page (TBD) + email | "We are experiencing an issue with [feature]. ETA: [X]. Updates every 30 min." |
| Admin users | In-app notification | Push notification via `lib/notifications-service.ts` |
| Dev team | Internal Slack/WhatsApp | Tag @yohanan.bukshpan |

---

## 11. Post-incident review (PIR) template

After every P0/P1, complete within 48 hours:

```markdown
## PIR — [incident title] — [date]

**Duration**: X hours Y minutes
**Impact**: X% of users affected, Y feature impacted
**Root cause**: ...
**Timeline**:
- HH:MM — First alert / user report
- HH:MM — Investigation started
- HH:MM — Root cause identified
- HH:MM — Fix deployed
- HH:MM — Service restored

**What went well**: ...
**What went wrong**: ...
**Action items**:
- [ ] item 1 (owner, due date)
- [ ] item 2 (owner, due date)
```

---

## 12. Recovery verification checklist

After ANY restore operation:

- [ ] `curl https://bsd-ybm.co.il/api/health` returns 200
- [ ] Login works (Google OAuth + credentials)
- [ ] Create a test invoice — verify it appears in DB
- [ ] Scan a test document — verify AI analysis returns
- [ ] Check Sentry — no new errors in last 5 minutes
- [ ] Check PostHog — active sessions visible
- [ ] Notify users that service is restored
