# אינטגרציות — סטטוס ואבטחה

מסמך זה מתאר שירותים עם soft-gate או אפיון אבטחה מיוחד. עדכון: 2026-07-16 (all-gaps track).

## מס הכנסה (ITA) — `lib/services/ita-service.ts`

- אין מספרי הקצאה מדומים בפרודקשן.
- Live HTTP כש-`ITA_PRODUCTION_KEY` **ו-**`ITA_API_URL` מוגדרים → `POST {ITA_API_URL}/allocation`.
- מפתח בלי URL / בלי מפתח כשנדרש הקצאה → כשל ברור; הנפקה → **422**.
- Mock רק אם `ALLOW_ITA_MOCK=true` (local / E2E).

## תשלומים — Refunds / Stripe

| נתיב | סטטוס |
|------|--------|
| `POST /api/billing/refunds` | PayPal + PayPlus (+ Stripe gateway) — org admin |
| Stripe Checkout | `POST /api/billing/stripe/create-checkout` — soft-gate בלי `STRIPE_SECRET_KEY` |
| Stripe webhooks | `/api/webhooks/stripe` — דורש `STRIPE_WEBHOOK_SECRET` |

## Google Calendar — `/api/integrations/google-calendar/*`

סנכרון opt-in חי. Legacy GET **לא** מחזיר «בפיתוח» — `syncRoutes` כשלא מחובר.

## MPP (MS Project)

- ייבוא `.mpp` דרך `MPP_CONVERT_URL` (שירות המרה חיצוני) → pipeline XML קיים.
- בלי converter: `mpp_converter_not_configured` (ברור). XML/CSV נשארים נתמכים.

## pgvector

- מיגרציה + dual-write + ANN search כש-`USE_PGVECTOR=true` אחרי `migrate deploy`.
- Fallback: JSON + cosine ב-JS.

## Admin self-heal — `POST /api/admin/self-heal`

- מוגן ב-`withOSAdmin`; `dryRun` ברירת מחדל **true**.
- ראו [`SELF-HEAL-SECURITY.md`](./SELF-HEAL-SECURITY.md).
- אין auto-cron בלי opt-in.

## AI kill switch

- `DISABLE_AI_FALLBACK=true` → 503 ידידותי על scan/chat (ראו DR-PLAN §6).

## PostHog (אירועי מוצר)

| אירוע | מקור |
|--------|------|
| `widget_opened` | `hooks/use-window-manager.ts` |
| `scan_started` / `scan_completed` | `AiScannerWidget` |
| `automation_executed` | `hooks/useAutomationRunner.ts` |
| `pdf_exported` | `InvoiceActionBar` |
