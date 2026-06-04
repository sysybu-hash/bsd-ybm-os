# SYSTEM_BRAIN.md — BSD-YBM OS

> מסמך-אב לסוכני AI ומפתחים. קונבנציות מפורטות ב-[CLAUDE.md](./CLAUDE.md) — כאן ארכיטקטורה, בידוד דיירים, חיוב, ומפת מערכת.

## 1. מה המוצר

**BSD-YBM OS** — מערכת תפעול לעסקים בבנייה ומקצועות: CRM, פרויקטים, ERP/מסמכים, סריקת AI, חיוב, Field Copilot, AI Hub, מחולל אפליקציות.  
Stack: Next.js 15 App Router · Prisma/Neon · NextAuth · PostHog · Sentry · PayPlus/PayPal.

## 2. בידוד דיירים (Tenant isolation)

### עקרון

כל נתון עסקי שייך ל-`organizationId`. אין גישה cross-tenant דרך API מאומת.

### מימוש

| שכבה | מיקום | תפקיד |
|------|--------|--------|
| Middleware | `middleware.ts` | JWT חובה ל-`/api/*` (מלבד allowlist ציבורי) |
| Wrapper | `lib/api-handler.ts` → `withWorkspacesAuth()` | מחלץ `orgId`, `userId`, `role` מה-session |
| DB | כל מודל עסקי | שדה `organizationId` + `where: { organizationId: orgId }` |

### כללים

- Route מאומת: **תמיד** `withWorkspacesAuth` — לא לסמוך על `organizationId` מה-body.
- מזהה ב-URL (`projectId`, `contactId`): לוודא `findFirst({ where: { id, organizationId: orgId } })` לפני עדכון/מחיקה.
- אדמין פלטפורמה: `withOSAdmin()` / `isAdmin(email)` — נפרד מ-ORG_ADMIN.
- אין `CustomerType.PLATFORM_ADMIN` — אדמין לפי רשימת מיילים (`lib/is-admin.ts`).

### לידים שיווקיים

`POST /api/leads` → `Contact` ב-**ארגון הראשון לפי `createdAt`** (בעלים/פלטפורמה). לא יוצר ארגון חדש.

## 3. מצב חיוב ומנוי (Billing state)

### שדות מרכזיים (`Organization`)

| שדה | משמעות |
|-----|---------|
| `subscriptionTier` | `FREE` \| `HOUSEHOLD` \| `DEALER` \| `COMPANY` \| `CORPORATE` |
| `subscriptionStatus` | מחרוזת: `INACTIVE`, `ACTIVE`, `PENDING_APPROVAL`, … |
| `trialEndsAt` | סיום ניסיון ל-FREE |
| `cheapScansRemaining` / `premiumScansRemaining` | מכסת סריקות |
| `stripeCustomerId` / `stripeSubscriptionId` | Stripe (אם מופעל) |

### זרימות טיפוסיות

```
הרשמה כללית (ללא הזמנה/תוכנית)
  → User: PENDING_APPROVAL, Org: PENDING_APPROVAL
  → מייל למנהל + welcome למשתמש

הרשמה עם invite / plan / org-invite
  → User: ACTIVE, Org: ACTIVE + tier

FREE tier
  → trialEndsAt מוגדר (ראה lib/trial.ts)
  → cron lifecycle: אזהרה 3 ימים לפני סיום (lib/lifecycle-emails.ts)
```

### תשלום

- Webhooks: `app/api/webhooks/payplus`, `paypal` — אימות HMAC (`lib/webhook-verify.ts`).
- PayPal orders: `app/api/billing/paypal/*`.
- הגדרות ארגון: `OSBillingConfig` / `billingWorkspaceJson` (JSON).

## 4. טופולוגיית Prisma (58 מודלים — קטגוריות)

| קטגוריה | דוגמאות |
|---------|---------|
| **Auth / Org** | `Organization`, `User`, `OrganizationInvite`, `SubscriptionInvitation` |
| **Projects** | `Project`, `Task`, `PaymentMilestone`, `ProgressBill`, `ProjectBoqLine`, `WorkDiary` |
| **CRM** | `Contact`, `Quote` |
| **Documents / ERP** | `Document`, `DocumentScanJob`, `IssuedDocument`, `Invoice`, `ExpenseRecord` |
| **AI** | `DocumentScanCache`, `FieldCopilotSession`, `AICorrection`, `Automation` |
| **Billing / Infra** | `RateLimit`, `FinancialInsight`, `CloudIntegration`, `CustomAppSchema` |

מקור אמת: `prisma/schema.prisma`.

## 5. מפת API (~192 routes)

### ציבורי (ללא session)

| Prefix | הערות |
|--------|--------|
| `/api/auth/*` | NextAuth |
| `/api/register` | rate limit 5/h/IP |
| `/api/leads`, `/api/unsubscribe` | שיווק |
| `/api/health` | `SELECT 1` |
| `/api/webhooks/*` | HMAC |
| `/api/cron/*` | `withCronGuard` |
| `/api/marketing/*` | דמו נחיתה |

### Workspace (מאומת)

| תחום | Prefix |
|------|--------|
| פרויקטים | `/api/projects`, `/api/projects/[id]/*` |
| CRM | `/api/crm/contacts` |
| ERP | `/api/erp/*`, `/api/documents/*` |
| AI | `/api/ai/*`, `/api/scan/*`, `/api/analyze*` |
| שדה | `/api/field-copilot/*` |
| אדמין | `/api/admin/*` |

סריקה: `npm run audit:api` · rate limits: `npm run audit:rate-limits`.

## 6. AI & Field-First (נקודות עיגון)

| יכולת | קוד |
|--------|-----|
| Tri-engine סריקה | `lib/ai/scan-post-actions.ts`, `app/api/scan/tri-engine/*` |
| גרמושקה → BOQ | `app/api/projects/analyze-blueprint` → `ProjectBoqLine` |
| אסיסטנט אדמין (propose→execute) | `lib/admin-assistant/` |
| Field Copilot + קול | `FieldCopilotWidget`, Gemini Live sessions |
| תזרים / Guardian | `lib/finance-forecast`, `app/api/cron/cashflow-guardian` |

## 7. ציר צמיחה (Growth — B)

| רכיב | נתיב |
|------|------|
| בלוג | `app/blog/`, `lib/blog/blog-content.ts` |
| לידים | `app/contact`, `app/api/leads` |
| Lifecycle email | `lib/lifecycle-emails.ts`, cron `lifecycle-emails` |
| Unsubscribe | `app/api/unsubscribe`, `app/unsubscribe` |
| PostHog funnel | `lib/analytics/marketing-funnel.ts` — אירועי `funnel_*` |

## 8. אימות לפני שער פאזה

```bash
npm run verify          # lint + tsc + audit:api + audit:rate-limits + jest
npm run verify:all      # + Playwright
npm run audit:rate-limits
```

E2E קריטי: `e2e/tenant-isolation.spec.ts`, `e2e/financial-flow.spec.ts`, `e2e/document-scan-flow.spec.ts`.

## 9. עדכון מסמך זה

עדכן `SYSTEM_BRAIN.md` כשמוסיפים: מודל Prisma מרכזי, prefix API ציבורי חדש, שינוי state machine חיוב, או שינוי אסטרטגיית tenant.
