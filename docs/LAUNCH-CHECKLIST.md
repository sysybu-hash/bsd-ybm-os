# Launch Readiness Checklist (FIX-PLAN §12)

## אבטחה

- [x] `npm audit` — CI (critical gate)
- [x] כל webhook עם אימות HMAC (PayPlus)
- [x] `orgId` בכל query מאומת (RLS לוגי) — `withWorkspacesAuth`
- [x] Rate limits — default על workspace API + auth/KV מפורשים (`audit:rate-limits`)

## תשתית

- [ ] `DATABASE_URL` production ב-Vercel
- [ ] `npm run db:migrate:deploy` על Neon
- [ ] Sentry DSN + Crons פעילים
- [ ] PostHog production key

## מוצר

- [ ] [PRODUCT-MAP.md](./PRODUCT-MAP.md) מעודכן
- [ ] Onboarding v2 + באנר launcher v2
- [ ] 5 מסעות ליבה עוברים ([QA-PLAN.md](./QA-PLAN.md))

## ביצועים ו-SEO

- [ ] Lighthouse נחיתה ≥90 (Performance, A11y, SEO) — הרצה מקומית: `npm run lighthouse:sample` + CI [lighthouse.yml](../.github/workflows/lighthouse.yml). אופטימיזציה: `LandingPage.tsx` (פונטים/עומס ראשוני).
- [x] `sitemap.xml` + JSON-LD ([StructuredDataScript](../components/seo/StructuredDataScript.tsx))
- [x] PWA manifest + shortcuts + screenshots אמיתיים ([public/manifest.json](../public/manifest.json), [public/screenshots/](../public/screenshots/))

## תפעול

- [x] [VERCEL-ENV-CHECKLIST.md](./VERCEL-ENV-CHECKLIST.md) — רשימת env + crons
- [x] [RUNBOOK.md](./RUNBOOK.md) — טבלת 13 crons (2026-06-04)
- [ ] [RUNBOOK.md](./RUNBOOK.md) — on-call ידוע (אנושי)
- [x] [DR-PLAN.md](./DR-PLAN.md) — drill מקומי 2026-06-04; PITR מלא בקונסולה — ידני
- [ ] [SLO.md](./SLO.md) — alerts מחוברים

## Sign-off

- [x] [KPI-SIGNOFF.md](./KPI-SIGNOFF.md) — baseline 2026-06-04 ([BASELINE-10-10](./BASELINE-10-10.md)); CI gates מתועדים
- [ ] מילוי מאשר + מדידות production סופיות
