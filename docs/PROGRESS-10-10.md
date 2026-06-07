# התקדמות מסלול 10/10 — 2026-06-07

## הושלם (קוד + CI + תיעוד תפעול)

| שלב | פריטים |
|-----|--------|
| Growth / Phase 3–4 | blog, contact, leads, lifecycle cron, unsubscribe, BOQ agent, Voice diary, CRM embeddings + **cron** `contact-embeddings` |
| Knowledge Vault RAG | chunks, index, `GET /api/knowledge-vault/search`, **UI סמנטי** ב-`KnowledgeVaultPicker` |
| תשלומים | create-order + **capture-order** דרך `PayPalGateway.captureOrder` / `capturePayPalOrder` |
| lib split P0 | `product-brochure-v2-data.ts`, `product-brochure-v2-assets.ts`, `auth/nextauth-callbacks`, `tri-engine-gemini` |
| lib split P1 (2026-06-07) | `tri-engine-types.ts`, `tri-engine-parse.ts`, `tri-engine-extract-validated.ts`, `user-launcher-config.layout.ts` |
| Lighthouse CI | ספי **error ≥90** בכל lighthouserc* (local + production) |
| E2E ci-gate | job ב-`quality-gate.yml` (Playwright chromium + mobile-chrome) |
| Unit tests | +`tri-engine-parse.test.ts`; coverage על parse/types |
| E2E ci-gate (specs) | `growth-public`, `knowledge-vault-search`, `boq-agent-api`, `accounting-export` |
| Ops docs | [VERCEL-ENV-CHECKLIST](./VERCEL-ENV-CHECKLIST.md), RUNBOOK crons, DR drill date |

## פקודות

```bash
npm run db:migrate
npm run verify
npm run test:coverage    # CI threshold 75%
npm run test:e2e:ci-gate
npm run ops:neon-dr-drill
npm run ops:10-10-status
npm run lib:line-count
```

## נותר (ידני / הדרגתי)

| פריט | הערות |
|------|--------|
| `db:migrate` ב-Vercel Production + Preview | אחרי env — [VERCEL-ENV-CHECKLIST](./VERCEL-ENV-CHECKLIST.md) |
| 5 מסעות ליבה + Phase 3–4 QA ידני | [QA-PLAN](./QA-PLAN.md) |
| Lighthouse ≥90 production (מדידה) | CI יכשל אם מתחת ל-90 — `npm run lighthouse:matrix:prod` |
| KPI מאשר אנושי | [KPI-SIGNOFF](./KPI-SIGNOFF.md) |
| PITR מלא ב-Neon | קונסולה — אחרי drill מקומי |
| `CSP_STRICT=true` | Preview → smoke → Production |
| פיצול קבצים ≥300 | **~34** קבצים — [LIB-SPLIT-BACKLOG](./LIB-SPLIT-BACKLOG.md) (P1 הושלם חלקית) |
| pgvector native | **נדחה** — JSON + cosine ב-JS מספיק ל-RAG קטן |
| Refunds API | **ידני** בדשבורד PayPal/PayPlus — RUNBOOK §7 |
| VoiceActivityLogger + Gemini Live | **הפרדה מכוונת** — Live ב-Omnibar/Chat; יומן שטח = Web Speech |
| MPP (mpxj) | לא ב-scope |
