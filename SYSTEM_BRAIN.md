# SYSTEM_BRAIN.md — BSD-YBM OS · ידע ליבה לפיתוח ול-AI Agents

> **מי קורא קובץ זה:** מפתחים חדשים, AI coding agents, סוכני פעולה אוטומטיים.
> **מה הוא נותן:** קיצור דרך ל-architecture decisions, tenant isolation, billing flow, ומפת ה-186 routes.
> **מה הוא לא:** תיעוד API מלא (ראה docs/ARCHITECTURE.md). לא חוזר על CLAUDE.md.

---

## 1. ארכיטקטורה בגרסה-מהירה

```
Next.js 15.5 App Router
  app/                     ← pages + API routes (186 routes)
  components/os/           ← OS shell + 22 widgets + layout
  lib/                     ← ALL server logic (169 files, 36 subdirs)
  hooks/                   ← client-only hooks
  prisma/                  ← schema (58 models) + 37 SQL migrations
  e2e/                     ← Playwright (24 specs)
  messages/                ← i18n: he/en/ru (30 files)
```

**Stack:** Next.js 15.5 · React 18.3 · Prisma 6.19 · Neon serverless PostgreSQL · NextAuth 4.24 · Zod 4 · Tailwind CSS RTL-first · Sentry + PostHog · Gemini 2.5 (primary AI) · Anthropic Claude + OpenAI + Groq · PayPlus + PayPal.

---

## 2. Tenant Isolation — אסטרטגיה מדויקת

### הכלל

כל route workspace **חייב** להיות עטוף ב-`withWorkspacesAuth()` מ-`lib/api-handler.ts`.
הפונקציה:
1. מאמתת session JWT דרך NextAuth.
2. מחלצת `orgId` + `userId` + `role` מה-JWT (לא מ-DB — חשוב לביצועים).
3. מזריקה `WorkspaceAuthContext = { orgId, userId, role }` ל-handler.

```ts
// דפוס סטנדרטי — לא לסטות ממנו
export const GET = withWorkspacesAuth(async (req, { orgId, userId }) => {
  const data = await prisma.X.findMany({ where: { organizationId: orgId } });
  return NextResponse.json(data);
});
```

### IDOR — מה שמגן

כל query ל-Prisma חייב לכלול `organizationId: orgId` ב-WHERE.
דפוס מאומת ב-`lib/projects/project-access.ts` → `requireProjectForOrg(projectId, orgId)`:
```ts
// ALWAYS use this — never naked prisma.project.findFirst({ where: { id } })
const gate = await requireProjectForOrg(projectId, orgId);
if (!gate.ok) return gate.response; // 404
```

### Rate limiting

כל route workspace מקבל default 200 req/min per user (מ-`DEFAULT_WORKSPACE_RATE_LIMIT`).
Routes ציבוריים **חייבים** `applyRateLimit()` מפורש:
```ts
const limited = await applyRateLimit(req, "key:action", 10, 60_000);
if (limited) return limited; // 429
```
Routes פטורים מוגנים ב-session/HMAC/framework — מתועדים ב-`SENSITIVE_PROTECTED_ALLOWLIST` (scripts/audit-rate-limits.mjs).
לאימות: `npm run audit:rate-limits` + `npm run audit:api`.

---

## 3. Billing & Subscription — State Machine

### SubscriptionTier (enum)
```
FREE → HOUSEHOLD → DEALER → COMPANY → CORPORATE
```

### Organization subscription flow
```
Registration (free/invite)
  └─ subscriptionStatus: "PENDING_APPROVAL" | "ACTIVE"
       └─ PENDING: admin approves in /admin panel → "ACTIVE"
       └─ ACTIVE + FREE: trialEndsAt set (14 days default)
            └─ trial expires → tier stays FREE, scans limited
            └─ payment → subscriptionTier upgrades, unlimited scans

subscriptionStatus values:
  INACTIVE → initial value
  PENDING_APPROVAL → general signup (no invite, no paid plan)
  ACTIVE → usable
  SUSPENDED → overdue payment
  CANCELLED → churned
```

### OSBillingConfig (`model OSBillingConfig`)
Per-organization config for PayPlus subscription. Fields: `subscriptionTier`, `paylusSubscriptionId`, `paypalSubscriptionId`, `lastPaymentAt`, `nextPaymentAt`.

### Scan quotas
Set on `Organization`: `cheapScansRemaining`, `premiumScansRemaining`, `maxCompanies`.
Function `defaultScanBalancesForTier(tier)` in `lib/subscription-tier-config.ts` maps tier → balances.

### AccountStatus (User)
```
PENDING_APPROVAL → ACTIVE → SUSPENDED
```

---

## 4. מפת 58 מודלי Prisma

### Auth & Identity
| Model | תיאור |
|-------|--------|
| `Organization` | הדייר — 1 ארגון = 1 מנוי. כל entity אחר תלוי בו. |
| `User` | חבר צוות. role: ORG_ADMIN/ORG_MEMBER/VIEWER. |
| `UserPasskey` | WebAuthn passkey credentials. |
| `PasswordResetToken` | טוקן איפוס סיסמה (TTL 1 שעה, SHA-256 hashed). |
| `Session` / `Account` / `VerificationToken` | NextAuth adapter tables. |
| `OrganizationInvite` | הזמנת משתמש לצוות (token, expiresAt). |
| `SubscriptionInvitation` | הזמנת executive עם tier מוגדר מראש. |

### Projects & Work
| Model | תיאור |
|-------|--------|
| `Project` | פרויקט בנייה/ניהול. שדות: activeFrom/activeTo, scheduleSourceFile, lastScheduleImportAt. |
| `Task` | משימת גנט. שדות: startDate, endDate, progress, dependencies (JSON), parentTaskId, linkedBoqLineId, status/priority. |
| `WorkDiary` | יומן עבודה יומי, מקושר ל-Task ו-ProjectBoqLine. |
| `PaymentMilestone` | אבן דרך תשלום (name, amount, isPaid, datePaid, sortOrder). |
| `ProjectExtra` / `ProjectExpense` | הוצאות נוספות לפרויקט. |
| `ProjectBoqLine` | שורת כתב כמויות. source: "MANUAL"/"BLUEPRINT"/"IMPORT". |
| `ProjectBoqPhaseColumn` | עמודת שלב (phaseIndex 1-5) לשורת BOQ. |

### CRM
| Model | תיאור |
|-------|--------|
| `Contact` | לקוח/ספק. מקושר ל-Project דרך projectId. tags JSON. |
| `ActivityLog` | לוג פעולות CRM (kind, title, detail, at). |
| `FinancialInsight` | תובנות AI על לקוח (daily cron). |

### Documents & Billing
| Model | תיאור |
|-------|--------|
| `IssuedDocument` | חשבונית/הצעת מחיר/חוזה שהופק. docType enum. |
| `Invoice` | חשבונית מספק (מיובאת מסריקה). |
| `Quote` | הצעת מחיר פנימית (draft → accepted). |
| `ProjectQuote` | הצעת מחיר לפרויקט עם BOQ lines. |
| `ProgressBill` / `ProgressBillLine` | חשבון ביצוע חלקי. |
| `ExpenseRecord` | הוצאה עם receipt OCR. |
| `DocumentDraft` | טיוטת מסמך לפני הפקה. |

### AI & Knowledge
| Model | תיאור |
|-------|--------|
| `Notebook` / `NotebookSource` / `NotebookMessage` | NotebookLM-style sessions. |
| `NotebookAudioOverview` | סיכום קולי AI. |
| `Document` / `DocumentScanJob` / `DocumentScanCache` | מסמך שסרקנו + job tracking + cache. |
| `DocumentLineItem` | שורת פריט מסמך (OCR). |
| `AICorrection` | correction feedback לאימון AI. |
| `FieldCopilotSession` / `FieldCopilotAsset` | סשן field-copilot + קבצים. |

### Infra & Config
| Model | תיאור |
|-------|--------|
| `OSBillingConfig` | הגדרות מנוי (PayPlus/PayPal). |
| `Setting` | key-value config per org. |
| `RateLimit` | DB-backed rate limit rows (key, count, resetAt). |
| `Automation` / `AutomationRun` | Automation triggers + execution log. |
| `PushSubscription` | VAPID Web Push subscription. |
| `InAppNotification` | in-app notifications queue. |
| `EmailDigestItem` | items queued for daily email digest. |
| `PlatformSettings` | platform-level admin config (singleton). |
| `CustomAppSchema` / `CustomAppData` | App Builder schemas + runtime data. |
| `AppIdeaSubmission` | community app idea submissions. |

### Integrations
| Model | תיאור |
|-------|--------|
| `CloudIntegration` | Google Drive/Calendar credentials per user. |
| `DriveSyncEntry` | Drive file sync tracking. |
| `UserGoogleCalendarSettings` | per-user calendar sync config. |
| `GoogleCalendarEventLink` | link between Task/Project and GCal event. |
| `MeckanoZone` | Meckano attendance zone. |
| `ProductPriceObservation` | price alert tracking. |

---

## 5. מפת ה-186 API Routes לפי תחום

### Auth (10 routes)
`/api/auth/[...nextauth]` (NextAuth) · `forgot-password` · `reset-password` · `set-password` · `google-start/reconnect/callback` · `passkey/auth-options/verify` · `passkey/register-options/verify` · `passkey/list/[id]`

### Register & Invites (3 routes)
`/api/register` · `/api/org-invite/preview` · `/api/assign-user`

### Projects (12 routes)
`/api/projects` (CRUD list) · `/api/projects/[id]` · `.../boq` · `.../dashboard` · `.../milestones` · `.../tasks` · `.../tasks/schedule` · `.../work-diaries(/[diaryId])` · `.../expenses` · `.../extras` · `.../import/excel|schedule` · `.../export/excel` · `.../drive-folder` · `.../sync-meckano` · `.../notes` · `projects/analyze-blueprint` · `projects/detail|update`

### CRM (6 routes)
`/api/crm/contacts` (list/create) · `.../[id]` · `.../[id]/timeline` · `.../[id]/project-change-check` · `.../export` · `.../import` · `.../semantic-search`

### ERP & Documents (14 routes)
`/api/erp/documents(/[id])` · `erp/issued-documents(/[id])(/box)` · `erp/quotes` · `erp/line-items/[id]` · `erp/archive(/item/bulk-export/empty-trash)` · `erp/notebook` · `erp/price-compare(/comparison)` · `erp/project-notebook/chat(/stream)` · `documents/issued/[id](/export/send-reminder)` · `documents/issued/drafts`

### AI (10 routes)
`/api/ai(/chat/corrections/doc-draft/providers/operator)` · `ai-builder/chat|generate` · `ai/gemini-live/(session/field-copilot-session/app-builder-session)` · `ai/omni-voice` · `chat(/legacy)` · `analyze(/queue/add/process/status)` · `os/assistant/(context/interpret/parse-action/execute-tool)`

### Field Copilot (6 routes)
`/api/field-copilot/(session/analyze/assets(/[id])/handoff)`

### Scan (6 routes)
`/api/scan/(tri-engine(/stream)/engine-meta/share/sync-summary)` · `/api/org/scan-lookups`

### Google Drive (9 routes)
`/api/os/google-drive/(files/folders/download/upload/settings/sync/workspace/decode-batch/to-notebook)`

### Google Calendar (6 routes)
`/api/integrations/google-calendar(/calendars/settings(/activate)/sync)` · `integrations/google/calendar/connect|callback`

### Meckano (10 routes)
`/api/meckano/[...path]` · `meckano/(access/clock-in/employees/projects/zones(/[id])/reports(/export-pdf)/sync/contacts|zones-to-crm)`

### NotebookLM (8 routes)
`/api/notebooklm/(notebooks(/[id](/audio-overview))/chat/extract-pdf|source/from-scan/generate-document)`

### Knowledge Vault (4 routes)
`/api/knowledge-vault/(items/ingest/parse/issue)`

### Notifications & Push (4 routes)
`/api/notifications/(feed(/stream))` · `user/notifications` · `push/subscribe`

### Billing (4 routes)
`/api/billing/paypal/(create-order/capture-order)` · `webhooks/payplus|paypal`

### Org & User (5 routes)
`/api/organization` · `org/(insights/daily/check-email-verified/resend-verification)` · `user/launcher-config` · `user/notifications`

### Marketing (3 routes)
`/api/marketing/(demo-scan/assistant/chat/assistant/gemini-live/session)`

### Admin (11 routes)
`/api/admin/(assistant(/execute)/broadcast-notification/check-user/fix-roles/health/logs/platform-settings/self-heal/set-password/system-health/test-email)`

### Cron (8 routes — guarded by `withCronGuard`)
`/api/cron/(collection-reminders/email-digest/field-copilot-followups/financial-insights/google-calendar-push|sync/meckano-sync/task-reminders/work-diary-push)`

### Misc (8 routes)
`/api/health` (public) · `search` · `sign/[id]` · `reports/finance-csv` · `quotes` · `expenses/confirm` · `feedback` · `telemetry/wizard` · `locale` · `data` · `debug-session` · `org/insights/daily`

---

## 6. כללי קונבנציה קריטיים (תקציר מ-CLAUDE.md)

```ts
// ❌ אסור לחלוטין
console.log(...)            // → createLogger("module")
new PrismaClient()          // → import { prisma } from "@/lib/prisma"
process.env.X               // → env.X מ-lib/env.ts
catch (err: any)            // → catch (err: unknown)
"text" hardcoded in JSX     // → t("key") מ-useI18n()
pl-4 / pr-4 in Tailwind     // → ps-4 / pe-4 (logical RTL)

// ✅ תמיד
withWorkspacesAuth(...)      // כל route workspace
applyRateLimit(...)          // כל route ציבורי
Zod schema: בגוף בקשה        // schema: option ב-withWorkspacesAuth
requireProjectForOrg(id, orgId) // לפני כל שאילתת project
```

---

## 7. נכסים מיוחדים שכדאי להכיר

| נכס | מיקום | מה הוא עושה |
|-----|--------|-------------|
| **AI tri-engine** | `lib/tri-engine-extract.ts` | Gemini→OpenAI→Groq fallback chain למסמכים |
| **Blueprint decoder** | `lib/projects/blueprint-analyze.ts` | PDF גרמושקה → tasks+milestones+BOQ via Gemini multimodal |
| **OS Automations** | `lib/os-automations/` | intent detection → tool execution (Gemini) |
| **Admin Assistant** | `lib/admin-assistant/` | propose_*→TTL token→execute דפוס |
| **Rate limit (DB)** | `lib/rate-limit.ts` | Neon-safe (RateLimit table), לא Redis |
| **Webhook verify** | `lib/webhook-verify.ts` | timing-safe HMAC-SHA256 לPayPlus |
| **Logger** | `lib/logger.ts` | PII auto-redact (email, ID, phone, CC) |
| **Env validation** | `lib/env.ts` | Zod schema, throws on startup if invalid |
| **Workspace bounds** | `lib/workspace/workspace-bounds-registry.ts` | ref ל-drag bounds של widgets |

---

## 8. תהליך deploy

```bash
# Local verify (חובה לפני PR)
npm run verify        # lint + tsc + audit:api + audit:rate-limits + jest
npm run verify:all    # + playwright chromium+mobile

# Migrations (Neon — ללא shadow DB)
# לא: prisma migrate dev
# כן: כתיבה ידנית ל-prisma/migrations/ + npm run db:migrate

# Build in prod (Vercel)
npm run build         # scripts/prebuild.mjs + next build
                      # prebuild: prisma generate + ensure-production-schema.mjs
```

---

*קובץ זה נוצר ב-04/06/2026 · Phase 2 of BSD-YBM OS production hardening.*
*לעדכון: ערוך ישירות — הוא source of truth, לא תיעוד שנוצר אוטומטית.*
