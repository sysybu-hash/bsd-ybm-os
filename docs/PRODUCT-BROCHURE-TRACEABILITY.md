# גיליון התאמה — דף מוצר BSD-YBM OS

מקור טענות: `lib/pdf/product-brochure-v2-html.ts` (`SHOWCASES[]`).

| מודול | טענה | Route / API | קובץ UI | בדיקה | סטטוס |
|-------|------|-------------|---------|-------|--------|
| פיננסים | ייצוא CSV/PDF | `GET /api/reports/finance-csv`, `finance-pdf` | `DashboardWidget.tsx`, `useFinanceReportExport.ts` | E2E `product-brochure-finance-export.spec.ts` | PASS |
| CRM | ייצוא CSV | `GET /api/crm/contacts/export` | `CrmTableWidget.tsx`, `useCrmTable.ts` | E2E `product-brochure-crm.spec.ts` | PASS |
| CRM | חיפוש סמנטי | `POST /api/crm/semantic-search` | `useCrmTable.ts` (מצב חכם) | E2E CRM + fallback ללא מפתח | PASS |
| CRM | תגיות | `PATCH /api/crm/contacts/[id]`, `?tag=` | `ClientDetailModal`, `CrmContactsTable` | מיגרציה `20260526120000_contact_tags_meckano_sync` | PASS |
| CRM | היסטוריה | `GET /api/crm/contacts/[id]/timeline` | `ClientDetailModal` טאב היסטוריה | E2E CRM | PASS |
| Calendar | Google Calendar sync | `GET/PUT /api/integrations/google-calendar/*`, OAuth calendar connect | `SettingsCalendarSection`, `GoogleCalendarWidget` | E2E `google-calendar-sync.spec.ts` (skip ללא session) | PASS |
| ארכיון | ייצוא בכמות | `POST /api/erp/archive/bulk-export` | `ErpFileArchiveWidget`, `useArchiveData.ts` | E2E `product-brochure-archive-bulk.spec.ts` | PASS |
| Meckano | סנכרון אוטומטי | `GET /api/cron/meckano-sync` | `MeckanoReportsWidget` (סטטוס סנכרון) | Cron `vercel.json` 05:00 UTC | PASS |
| נחיתה | CWV | — | `LandingPage.tsx` | `npm run lighthouse:sample` | ראה `LAUNCH-CHECKLIST.md` |
| דף מוצר PDF | צילומי מסך מעודכנים | — | `scripts/capture-product-brochure-v2.ts` | **ידני** — [PRODUCT-BROCHURE-צעדים-ידניים.md](./PRODUCT-BROCHURE-צעדים-ידניים.md) | USER |

עדכון אחרון: 2026-05-26.
