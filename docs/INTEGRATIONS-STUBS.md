# אינטגרציות — סטטוס ואבטחה

מסמך זה מתאר שירותים שטרם מומשו במלואם. **אין לממש self-heal אוטומטי בפרודקשן** ללא אפיון אבטחה.

## מס הכנסה (ITA) — `lib/services/ita-service.ts`

- דורש `ITA_PRODUCTION_KEY` ב-Vercel / `.env.local` לחיבור production.
- ללא מפתח: המערכת מחזירה מספר הקצאה mock (`isMock: true`) ורושמת אזהרה בלוג.
- מימוש API מלא לפי מפרט רשמי — פרויקט נפרד כשיש מפתח production מאושר.

## Google Calendar — `GET /api/integrations/google-calendar`

- מוגן ב-`withWorkspacesAuth`.
- מחזיר `connected: false` והודעה «בפיתוח».
- OAuth מלא (scopes, tokens ב-DB, סנכרון אירועים) — שלב עתידי.

## Admin self-heal — `POST /api/admin/self-heal`

- מוגן ב-`withOSAdmin` בלבד.
- Stub: מחזיר `status: "skipped"` — לא מבצע תיקוני DB אוטומטיים.

## PostHog (אירועי מוצר)

| אירוע | מקור |
|--------|------|
| `widget_opened` | `hooks/use-window-manager.ts` |
| `scan_started` / `scan_completed` | `AiScannerWidget` |
| `automation_executed` | `hooks/useAutomationRunner.ts` |
| `pdf_exported` | `InvoiceActionBar` |
