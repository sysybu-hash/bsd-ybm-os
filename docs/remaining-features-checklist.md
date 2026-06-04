# רשימת תכונות — בוצע / נותר

| תחום | סטטוס | הערות |
|------|--------|--------|
| מרכז שליטה (API + UI) | בוצע | `docs/project-control-center.md` |
| CRM ↔ פרויקט (שיוך, פרויקט חדש, מרכז שליטה) | בוצע | `syncInProgress`, `syncDirection`, אינדיקטור |
| AI סריקה SITE_LOG / QUOTE / PROGRESS | בוצע | V5 + AUTO + postActions |
| מחברת לפי projectId | בוצע | create-on-first-open |
| Web Push + יומן | בוצע | `docs/work-diary-push.md` |
| ייבוא XML/CSV + Excel | בוצע | בדיקות unit + fixtures |
| E2E project/CRM/mobile/live | בוצע | `test:e2e:project`, `test:e2e:crm` |
| MPP ישיר (mpxj) | לא נכלל | ייצוא ל-XML/CSV בלבד |
| Growth (blog, contact, leads, lifecycle, unsubscribe) | בוצע בקוד | QA: `e2e/growth-public.spec.ts` |
| Phase 3–4 (BOQ agent, accounting export, CRM semantic, Voice diary) | בוצע בקוד | QA ידני + E2E API; embeddings cron Sun 03:00 UTC |
| Knowledge Vault RAG + UI חיפוש סמנטי | בוצע | `KnowledgeVaultPicker` + `/api/knowledge-vault/search` |
| PayPal capture via gateway | בוצע | `capturePayPalOrder` → `PayPalGateway` |
| pgvector ב-Neon | נדחה | JSON embeddings + JS cosine — מספיק לעתיד הקרוב |
| Gemini Live E2E מלא (מיקרופון) | נותר (ידני) | smoke בלבד ב-CI; VoiceActivityLogger ≠ Live (מכוון) |
| מצב ניהול עסק (`COMPANY_MGMT`) | בוצע | `docs/company-management-mode.md` — launcher, CRM, פרויקטים בלי BOQ, סריקה עסקית, הרשמה ומנוי באדמין |

## סביבה

```bash
npm run db:migrate
npm run seed:test
# ערכי E2E: e2e/.env.example
```
