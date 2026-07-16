# רשימת תכונות — בוצע / נותר

| תחום | סטטוס | הערות |
|------|--------|--------|
| מרכז שליטה (API + UI) | בוצע | `docs/project-control-center.md` |
| CRM ↔ פרויקט | בוצע | |
| AI סריקה + unified V2 | בוצע | post-actions server; kill-switch |
| מחברת / Web Push / Growth | בוצע | |
| MPP ישיר | בוצע (soft-gate) | `MPP_CONVERT_URL` + convert client |
| pgvector ב-Neon | בוצע (soft-gate) | `USE_PGVECTOR` + ANN search + JSON fallback |
| Gemini Live E2E | בוצע (CI harness) | `e2e/gemini-live-flow.spec.ts`; mic אמיתי — Owner staging |
| Refunds API | בוצע | PayPal/PayPlus/Stripe gateways |
| ITA HTTP | בוצע (soft-gate) | `ITA_API_URL` + key |
| Stripe | בוצע (soft-gate) | checkout + webhooks |
| Self-heal מאובטח | בוצע | dry-run + allowlist |
| EN i18n ליבה | בוצע חלקית | 4 מסכי ליבה + API errors; המשך הדרגתי |
| COMPANY_MGMT | בוצע | |

## Owner / חיצוני (לא קוד)

| פריט | סטטוס |
|------|--------|
| CSP smoke ידני (Google/PayPal/mic) | כותרת CSP בפרוד ✓; תרחישי דפדפן — Owner |
| SLO alerts בקונסולות | הוראות ב-`SLO.md` — Owner לסמן |
| Google OAuth verification | RUNBOOK — Owner |
| מפתחות ITA/Stripe/MPP worker בפרוד | soft-gate עד credentials |

## סביבה

```bash
npm run db:migrate
npm run seed:test
# ערכי E2E: e2e/.env.example
```
