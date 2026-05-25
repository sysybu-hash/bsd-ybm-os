# Launch Readiness Checklist (FIX-PLAN §12)

## אבטחה

- [ ] `npm audit` — אין critical ללא waiver
- [ ] כל webhook עם אימות HMAC (PayPlus)
- [ ] `orgId` בכל query מאומת (RLS לוגי)
- [ ] Rate limits על auth + KV + field-copilot

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

- [ ] Lighthouse נחיתה ≥90 (Performance, A11y, SEO)
- [ ] `sitemap.xml` + JSON-LD ([StructuredDataScript](../components/seo/StructuredDataScript.tsx))
- [ ] PWA manifest + shortcuts ([public/manifest.json](../public/manifest.json))

## תפעול

- [ ] [RUNBOOK.md](./RUNBOOK.md) — on-call ידוע
- [ ] [DR-PLAN.md](./DR-PLAN.md) — תרגיל שחזור בוצע ב-90 יום
- [ ] [SLO.md](./SLO.md) — alerts מחוברים

## Sign-off

- [ ] [KPI-SIGNOFF.md](./KPI-SIGNOFF.md) — כל עמודי 10/10 נספרו
