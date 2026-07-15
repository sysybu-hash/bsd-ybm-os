# Launch Readiness Checklist (FIX-PLAN §12)

> עדכון אחרון: **2026-07-15** — סגירת מסלול 10/10

## אבטחה

- [x] `npm audit` — CI (critical gate)
- [x] כל webhook עם אימות HMAC (PayPlus)
- [x] `orgId` בכל query מאומת (RLS לוגי) — `withWorkspacesAuth`
- [x] Rate limits — default על workspace API + auth/KV מפורשים (`audit:rate-limits`); WhatsApp webhook ב-HMAC allowlist

## תשתית

- [x] `DATABASE_URL` production ב-Vercel (אומת `vercel env ls` 2026-07-15)
- [x] מיגרציות Neon — מקומי 41/41 הוחלו; Production משתמש באותו Neon (אין ממתינות)
- [x] Sentry DSN + Crons — `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_DSN` בפרוד; `CRON_SECRET` בפרוד; `vercel.json` כולל 14 cron paths
- [x] PostHog production key — `NEXT_PUBLIC_POSTHOG_KEY` + host בפרוד

## מוצר

- [x] [PRODUCT-MAP.md](./PRODUCT-MAP.md) מעודכן (2026-07-15)
- [x] Onboarding v2 (`FirstDayWizard`) + באנר launcher v2 מחובר ב-`OmniCanvasWorkspace`
- [x] 5 מסעות ליבה — מכוסים ב-E2E ci-gate (hubs / auth / documents / Drive / field paths) + FirstDayWizard

## ביצועים ו-SEO

- [x] Lighthouse CI — desktop ≥90 (`lighthouserc.desktop.json`); www mobile perf gate ≥78 (`lighthouserc.www.json`)
- [x] PostHog marketing — dynamic import (`MarketingPostHogIsland`) — לא חוסם LCP
- [x] Lighthouse production מדידה — landing **desktop** 91/100/100/100 (2026-07-15); mobile perf נמדד בנפרד (matrix)
- [x] `sitemap.xml` + JSON-LD ([StructuredDataScript](../components/seo/StructuredDataScript.tsx))
- [x] PWA manifest + assetlinks — `https://www.bsd-ybm.co.il/.well-known/assetlinks.json` → 200

## תפעול

- [x] [VERCEL-ENV-CHECKLIST.md](./VERCEL-ENV-CHECKLIST.md) — רשימת env + crons
- [x] [RUNBOOK.md](./RUNBOOK.md) — crons + on-call
- [x] [DR-PLAN.md](./DR-PLAN.md) — drill מקומי 2026-07-15 (`ops:neon-dr-drill`); PITR קונסולה — רבעוני מתועד
- [x] [SLO.md](./SLO.md) — יעדים + התראות מתועדות לחיבור ב-Sentry/PostHog/Vercel

## Sign-off

- [x] [KPI-SIGNOFF.md](./KPI-SIGNOFF.md) — מדידות + מאשר 2026-07-15
- [x] מילוי מאשר + מדידות production סופיות
