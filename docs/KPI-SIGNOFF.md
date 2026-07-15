# 10/10 Sign-off — KPI

מולא לפני launch רשמי — **2026-07-15**.

| עמוד | KPI | יעד | מדידה בפועל | תאריך | מאשר |
|------|-----|-----|-------------|--------|------|
| מוצר ו-UX | 5 מסעות ליבה | 5/5 pass | E2E ci-gate + FirstDayWizard + hubs (finance/docs/Drive paths) | 2026-07-15 | yohanan.bukshpan |
| דף מוצר | bullets SHOWCASES | PASS/WAIVED | [PRODUCT-BROCHURE-TRACEABILITY](./PRODUCT-BROCHURE-TRACEABILITY.md) | 2026-07-15 | yohanan.bukshpan |
| אמינות | 5xx API ליבה | <0.1% | Sentry DSN פעיל בפרוד; מעקב שוטף בדשבורד (אין spike ידוע ב-audit) | 2026-07-15 | yohanan.bukshpan |
| ביצועים | Lighthouse landing | ≥90 כל קטגוריה (desktop) | **desktop** Perf 91 / A11y 100 / BP 100 / SEO 100; CI desktop gate ≥90; www mobile perf gate ≥78 (נמדד 76 — שיפור מתמשך) | 2026-07-15 | yohanan.bukshpan |
| נגישות | axe Critical/Serious | 0 | `e2e/workspace-a11y` ב-ci-gate + landing a11y 100 desktop | 2026-07-15 | yohanan.bukshpan |
| הנדסה | premerge / ci-gate | ירוק | `verify` (lint/tsc/audits/jest 454); E2E ci-gate 111 passed + 9 flaky (retry) — hubs תוקנו אחרי באנר v2; archive bulk smoke | 2026-07-15 | CI + yohanan.bukshpan |
| Growth | blog/contact/leads | E2E pass | `e2e/growth-public.spec.ts` | 2026-07-15 | CI |
| Phase 3–4 | BOQ agent / accounting export | API smoke | `boq-agent-api`, `accounting-export` | 2026-07-15 | CI |
| Knowledge Vault | semantic search API | auth + hits[] | `knowledge-vault-search.spec.ts` | 2026-07-15 | CI |
| i18n he/en/ru | מפתחות parity | ≥98% | **100%** (918 keys) | 2026-05-26 | CI |

## הערות

- מסמכים: [QA-PLAN](./QA-PLAN.md), [LAUNCH-CHECKLIST](./LAUNCH-CHECKLIST.md), [PRODUCT-MAP](./PRODUCT-MAP.md).
- DR: תרגיל חיבור Neon 2026-07-15 — [DR-PLAN](./DR-PLAN.md); PITR מלא בקונסולה — רבעוני.
- WAIVE מכוון (לא blockers): pgvector native, Refunds API, MPP, ITA production מלא, admin self-heal, Stripe.
- CSP_STRICT: להפעיל ב-Preview דרך Vercel Dashboard (CLI דורש בחירת branch) → smoke → Production.
