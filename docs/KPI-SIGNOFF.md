# 10/10 Sign-off — KPI

מלא את הטבלה לפני launch רשמי. ראה [תוכנית 10/10](../.cursor/plans/) (קובץ התוכנית ב-Cursor).

| עמוד | KPI | יעד | מדידה בפועל | תאריך | מאשר |
|------|-----|-----|-------------|--------|------|
| מוצר ו-UX | 5 מסעות ליבה | 5/5 pass | ראה [QA-PLAN](./QA-PLAN.md) — E2E ci-gate | 2026-05-26 | |
| דף מוצר | bullets SHOWCASES | PASS/WAIVED | [PRODUCT-BROCHURE-TRACEABILITY](./PRODUCT-BROCHURE-TRACEABILITY.md) | 2026-05-26 | |
| אמינות | 5xx API ליבה | <0.1% | Sentry dashboard (ידני) | 2026-05-26 | |
| ביצועים | Lighthouse landing | ≥90 כל קטגוריה | CI lighthouse.yml — **error** ≥90 (2026-06-07) | 2026-06-07 | CI |
| נגישות | axe Critical/Serious | 0 | `e2e/workspace-a11y` + baseline | 2026-05-26 | |
| הנדסה | premerge / ci-gate | ירוק | `npm run verify` + E2E job ב-quality-gate + Lighthouse error ≥90 | 2026-06-07 | CI |
| Growth | blog/contact/leads | E2E pass | `e2e/growth-public.spec.ts` | 2026-06-04 | CI |
| Phase 3–4 | BOQ agent / accounting export | API smoke | `boq-agent-api`, `accounting-export` | 2026-06-04 | CI |
| Knowledge Vault | semantic search API | auth + hits[] | `knowledge-vault-search.spec.ts` | 2026-06-04 | CI |
| i18n he/en/ru | מפתחות parity | ≥98% | **100%** (918 keys) | 2026-05-26 | |

## הערות

- מסמכים: [QA-PLAN](./QA-PLAN.md), [LAUNCH-CHECKLIST](./LAUNCH-CHECKLIST.md), [PRODUCT-MAP](./PRODUCT-MAP.md).
- DR: תאריך תרגיל אחרון ב-[DR-PLAN](./DR-PLAN.md).
