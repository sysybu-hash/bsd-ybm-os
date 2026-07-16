# אינטגרציות — סטטוס ואבטחה

מסמך זה מתאר שירותים שטרם מומשו במלואם. **אין לממש self-heal אוטומטי בפרודקשן** ללא אפיון אבטחה.

## מס הכנסה (ITA) — `lib/services/ita-service.ts`

- **Blocked until real ITA API** — אין מספרי הקצאה מדומים בפרודקשן.
- ללא `ITA_PRODUCTION_KEY` (או בלי מימוש API): כשנדרש מספר הקצאה — כשל ברור (`success: false`); הנפקת מסמך מחזירה **422** עם `ita_allocation_required`.
- Mock רק אם `ALLOW_ITA_MOCK=true` (local / E2E).
- מימוש API מלא לפי מפרט רשמי — פרויקט נפרד כשיש מפתח + מפרט מאושר.

## Google Calendar — `/api/integrations/google-calendar/*`

סנכרון opt-in: המשתמש מאשר ובוחר `READ_ONLY` או `BIDIRECTIONAL` ב-`PUT .../settings/activate`. Cron: `google-calendar-sync`, `google-calendar-push`.

| Route | תפקיד |
|-------|--------|
| `GET /api/integrations/google-calendar` | אירועים (יומן מקומי או Google); כשלא מחובר — `localOnly: true` + `syncRoutes` |
| `GET/PUT .../settings` | הגדרות סנכרון |
| `POST .../settings/activate` | הפעלת סנכרון + בחירת יומן |
| `POST .../sync` | סנכרון ידני |
| `GET .../calendars` | רשימת יומנים (OAuth) |

Legacy `GET /api/integrations/google-calendar` **לא** מחזיר «בפיתוח» — מצביע ל-`syncRoutes` כש-Google לא מחובר.

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
