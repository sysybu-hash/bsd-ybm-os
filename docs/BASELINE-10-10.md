# Baseline 10/10 — 2026-06-04

מדידה לסגירת מסלול [KPI-SIGNOFF](./KPI-SIGNOFF.md).

| מדד | תוצאה |
|-----|--------|
| קבצי TS/TSX (ללא node_modules) | ~1410+ |
| קבצים ≥300 שורות | ~34 — `npm run lib:line-count` · [LIB-SPLIT-BACKLOG](./LIB-SPLIT-BACKLOG.md) |
| Unit tests | 324+ (כולל chunk-index, contact-embedding-cron, brochure modules) |
| Coverage CI | ≥75% statements/functions (`jest.config.js`) |
| `test:e2e:ci-gate` | + growth, KV search, BOQ agent, accounting export |
| i18n parity en/ru vs he | 100% workspace-shell keys |
| API audit | 0 unprotected (ידני: `npm run audit:api`) |

## החלטות ארכיטקטורה (2026-06-04)

| נושא | החלטה |
|------|--------|
| pgvector ב-Neon | נדחה — JSON + cosine ב-JS |
| Refunds | ידני בדשבורד PayPal/PayPlus |
| VoiceActivityLogger | Web Speech; Gemini Live נפרד (Omnibar/Chat) |
| MPP (mpxj) | לא ב-scope |

## Blockers ידני

- Lighthouse ≥90 production — `npm run lighthouse:sample`
- Sentry 5xx% — dashboard
- 5 מסעות ליבה — [QA-PLAN](./QA-PLAN.md)
- PITR מלא בקונסולת Neon
