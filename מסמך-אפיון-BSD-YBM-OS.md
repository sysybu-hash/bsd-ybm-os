# מסמך אפיון — BSD-YBM-OS

מסמך זה מתאר את **תוכן שורש הפרויקט**, את **מבנה האתר** (Next.js App Router), את **ממשקי ה-API**, את **מודל הנתונים**, ואת **הזרימות העיקריות** כפי שהן קיימות בקוד נכון לייצור המסמך.

---

## 1. זהות המוצר וטכנולוגיה

| פריט | ערך |
|------|-----|
| שם חבילה | `bsd-ybm-os` (גרסה `1.0.0`, `private`) |
| מסגרת | **Next.js** `^15.5.14` (App Router) |
| UI | **React** `18.3.1`, **Tailwind CSS** `3.4.x`, **Framer Motion**, **Lucide** |
| שרת | Node (API Routes, Server Actions) |
| מסד נתונים | **PostgreSQL** דרך **Prisma** `^6.19.3` |
| אימות | **NextAuth v4** (`next-auth`) עם Prisma Adapter — אסטרטגיית סשן **JWT** |
| פריסה | **Vercel** (`vercel.json` — Cron jobs) |

**תחום עסקי (מאפיין קוד):** מערכת ניהול / „מערכת הפעלה” לארגונים בענף **הבנייה** — CRM, ERP (מסמכים, הוצאות, חשבוניות מס), סריקות AI, אינטגרציית **מקאנו** (שעון / אזורים), גבייה (PayPal, PayPlus), דוחות, ועוד.

---

## 2. תיקיית השורש — מפת קבצים ותיקיות

נתיב בסיס: `BSD-YBM-OS/`

### 2.1 תיקיות ליבה

| נתיב | תפקיד |
|------|--------|
| `app/` | דפים, layouts, נתיבי `api/`, Server Actions תחת `actions/` |
| `components/` | רכיבי React — תתי־מבנה `os/` (שולחן עבודה), `landing/`, `ui/`, `theme-provider` וכו׳ |
| `lib/` | לוגיקה עסקית, אינטגרציות (AI, מייל, תשלומים), i18n, Prisma client וכו׳ |
| `hooks/` | הוקים ללקוח — ניהון חלונות/ווידג׳טים, Gemini Live, תעשייה וכו׳ |
| `messages/` | קבצי תרגום JSON (עברית, אנגלית, רוסית ועוד מפתחות לפי מודול) |
| `prisma/` | `schema.prisma`, תיקיית `migrations/` (כולל SQL ידני) |
| `public/` | נכסים סטטיים, PWA (`sw.js`, `manifest.json`), worklets ל-Gemini Live |
| `scripts/` | סקריפטי Node/תחזוקה (DB, Vercel env, seed, Lighthouse וכו׳) |
| `e2e/` | בדיקות Playwright |
| `types/` | הרחבות TypeScript (למשל `next-auth.d.ts`) |
| `.github/workflows/` | CI: `quality-gate.yml`, `neon-prisma-db-push.yml` |
| `.cursor/` | כללי Cursor לפרויקט |

### 2.2 קבצי קונפיגורציה בשורש

| קובץ | תפקיד |
|------|--------|
| `package.json` / `package-lock.json` | תלויות וסקריפטים (`dev`, `build`, `test`, `db:*`, `vercel:*` וכו׳) |
| `next.config.js` | אבטחת כותרות HTTP, `allowedDevOrigins`, `transpilePackages` לחתימה דיגיטלית, גבול גודל Server Actions ‎10MB |
| `middleware.ts` | NextAuth middleware, קידוד עוגיית locale, רשימת קידומי API מוגנים מול אנונימי |
| `tsconfig.json` | TypeScript |
| `tailwind.config.js` / `postcss.config.js` | עיצוב |
| `eslint.config.js` | ESLint |
| `jest.config.js` / `jest.setup.js` | Jest |
| `playwright.config.ts` | E2E |
| `vercel.json` | Cron: תובנות פיננסיות יומיות, עיבוד תור ניתוח |
| `.gitignore` / `.vercelignore` | החרגות גיט / Vercel |
| `next-env.d.ts` | טיפוסים אוטומטיים של Next |

### 2.3 קבצים נוספים בשורש (לפי סריקה)

- `README.md` — תיעוד פרויקט (קובץ טקסט; לא נקרא אוטומטית כאן)
- `test-meckano.js` — סקריפט בדיקה/חיבור למקאנו
- `dev-3004.log` — לוג פיתוח (מקומי)
- ספריות build/cache (לרוב לא בגיט): `.next/`, `node_modules/`, `playwright-report/`, `test-results/`
- סביבה: `.env`, `.env.local` (לא מתועדים ערכיהם במסמך זה)

---

## 3. דפי האתר (App Router)

| נתיב | קובץ | תיאור |
|------|------|--------|
| `/` | `app/page.tsx` | **לקוח:** אם אין סשן — `LandingPage`; עם סשן — מעטפת „OS”: כותרת, סרגל, `OSWorkspace`, Dock, מרכז התראות, גרירת קבצים |
| `/login` | `app/login/page.tsx` | התחברות (בפרט Google; הפניה ל־`/` לאחר אימות) |
| `/sign/[id]` | `app/sign/[id]/page.tsx` | חתימה דיגיטלית על הצעת מחיר (טוקן בנתיב) — `SignatureCanvas`, קריאה ל־`/api/sign/[id]` |

**קבצי מעטפת גלובליים:** `app/layout.tsx` (פונטים Heebo/Assistant, `ThemeProvider`, `SessionProvider`, i18n, נגישות, Toaster, רישום Service Worker ל־`/sw.js`), `app/error.tsx`, `app/not-found.tsx`.

**הערת middleware:** נתיבים כמו `/register`, `/legal`, `/privacy`, `/terms`, `/tutorial` מסומנים כציבוריים ב־`middleware.ts` — ייתכן שחלקם מיושמים >בהמשך< או בקישורים בלבד; בפועל קיימים בקוד העמודים המפורטים למעלה תחת `app/`.

---

## 4. ממשקי API (`app/api/`)

סה״כ נתיבי route handlers (כולל `route.tsx` ל-PDF): **81** קבצים.

### 4.1 אימות ומשתמשים

- `api/auth/[...nextauth]/route.ts` — NextAuth
- `api/auth/google-start/route.ts` — התחלת OAuth Google
- `api/register/route.ts` — הרשמה
- `api/assign-user/route.ts` — שיוך משתמש
- `api/debug-session/route.ts` — דיבוג סשן (מוגן ב-middleware)

### 4.2 AI וצ׳אט

- `api/ai/route.ts`, `api/ai/chat/route.ts`, `api/ai/operator/route.ts`, `api/ai/doc-draft/route.ts`
- `api/ai/providers/route.ts`, `api/ai/corrections/route.ts`, `api/ai/omni-voice/route.ts`
- `api/ai/gemini-live/session/route.ts`
- `api/chat/route.ts`
- `api/ai-assistant/route.ts`

### 4.3 ניתוח וסריקת מסמכים

- `api/analyze/route.ts`
- `api/scan/tri-engine/route.ts`, `api/scan/tri-engine/stream/route.ts`
- `api/scan/engine-meta/route.ts`, `api/scan/sync-summary/route.ts`
- `api/analyze-queue/add/route.ts`, `api/analyze-queue/status/route.ts`, `api/analyze-queue/process/route.ts`

### 4.4 CRM

- `api/crm/contacts/route.ts`, `api/crm/contacts/[id]/route.ts`
- `api/crm/import/route.ts`, `api/crm/semantic-search/route.ts`

### 4.5 ERP ומסמכים

- `api/erp/documents/route.ts`, `api/erp/documents/[id]/route.ts`
- `api/erp/issued-documents/route.ts`, `api/erp/issued-documents/[id]/route.ts`, `api/erp/issued-documents/box/route.ts`
- `api/erp/line-items/[id]/route.ts`
- `api/erp/quotes/route.ts`, `api/erp/price-compare/route.ts`, `api/erp/price-comparison/route.ts`
- `api/erp/notebook/route.ts`
- `api/erp/project-notebook/chat/route.ts`, `api/erp/project-notebook/chat-stream/route.ts`

### 4.6 מקאנו (HR / נוכחות / אזורים)

- `api/meckano/[...path]/route.ts` — פרוקסי כללי
- `api/meckano/zones/route.ts`, `api/meckano/zones/[id]/route.ts`
- `api/meckano/employees/route.ts`, `api/meckano/projects/route.ts`, `api/meckano/reports/route.ts`, `api/meckano/clock-in/route.ts`
- `api/meckano/sync/contacts/route.ts`, `api/meckano/sync/zones-to-crm/route.ts`

### 4.7 אינטגרציות ענן ולוח שנה

- `api/integrations/cloud/route.ts`
- `api/integrations/google-calendar/route.ts`

### 4.8 מערכת הפעלה / Google (Drive, Assistant)

- `api/os/google-drive/files/route.ts`
- `api/os/google-assistant/query/route.ts`

### 4.9 גבייה ותשלומים

- `api/billing/paypal/create-order/route.ts`, `api/billing/paypal/capture-order/route.ts`
- `api/webhooks/paypal/route.ts`, `api/webhooks/payplus/route.ts`

### 4.10 ארגון, הזמנות, הצעות מחיר חתומות

- `api/organization/route.ts`
- `api/org/scan-lookups/route.ts`, `api/org/insights/daily/route.ts`
- `api/org-invite/preview/route.ts`
- `api/quotes/route.ts`
- `api/sign/[id]/route.ts` — נתוני מסמך לחתימה
- `api/projects/update/route.ts`

### 4.11 דוחות ו-PDF

- `api/reports/finance-csv/route.ts`
- `api/reports/finance-pdf/route.tsx` — PDF (React-PDF / דומה)
- `api/professional-template/pdf/route.tsx` — תבנית מקצועית ל-PDF

### 4.12 ניהול (Admin)

- `api/admin/health/route.ts`, `api/admin/system-health/route.ts`
- `api/admin/logs/route.ts`, `api/admin/check-user/route.ts`, `api/admin/set-password/route.ts`
- `api/admin/fix-roles/route.ts`, `api/admin/self-heal/route.ts`, `api/admin/broadcast-notification/route.ts`

### 4.13 שונות

- `api/data/route.ts` — אגרגציה לדשבורד (למשל התראות)
- `api/search/route.ts`
- `api/locale/route.ts` — שפת ממשק
- `api/user/notifications/route.ts`
- `api/telemetry/wizard/route.ts`
- `api/cron/financial-insights/route.ts` — Cron Vercel

---

## 5. Server Actions (`app/actions/`)

קבצים (26): ניהול מנויים וחשבוניות (`billing-*`, `manage-subscriptions`, `admin-subscriptions`, `executive-subscriptions`), CRM (`crm`, `crm-admin`, `get-crm-data`), ארגון (`organization-actions`, `organization-invite`, `org-settings`), מסמכים (`issued-documents`, `professional-documents`, `process-document`, `save-scanned-document`, `send-doc-notification`), כספים (`expenses`, `finance-stats`, `export-accountant-csv`), ERP (`erp-compare`, `erp-line-items`, `get-issued-documents`), דשבורד (`get-dashboard-stats`, `get-executive-data`), מייל (`send-credentials-email`), ליטוש UI (`workspace-polish`), `get-dashboard-stats` וכו׳.

כל פעולה נקראת מרכיבי הווידג׳טים / הטפסים לפי הצורך.

---

## 6. ממשק המשתמש — „מערכת ההפעלה” (שורש `/` למשתמש מחובר)

### 6.1 ניהול חלונות וווידג׳טים

- הוק `useWindowManager` — מפתח localStorage: `bsd_ybm_layout_quiet_v3`
- טיפוסי ווידג׳טים (`WidgetType`):  
  `project`, `cashflow`, `aiChat`, `crm`, `dashboard`, `erp`, `quoteGen`, `aiScanner`, `projectBoard`, `crmTable`, `erpArchive`, `docCreator`, `aiChatFull`, `settings`, `meckanoReports`, `googleDrive`, `googleAssistant`

### 6.2 קבצי ווידג׳טים (`components/os/widgets/`)

- `DashboardWidget`, `CrmTableWidget`, `ProjectBoardWidget`, `CashflowWidget`
- `ErpDocumentsWidget`, `ErpFileArchiveWidget`, `DocumentCreatorWidget`
- `AiScannerWidget`, `AiChatFullWidget`
- `SettingsWidget`, `MeckanoReportsWidget`
- `GoogleDriveWidget`, `GoogleAssistantWidget`

### 6.3 רכיבי מעטפת OS

- `OSHeader`, `OSSidebar`, `OSWorkspace`, `OSDock`
- `NotificationCenter`, `FileDropzone`
- מערכת: `SessionProvider`, `Themer`, `I18nProvider`, `AccessibilitySettingsBootstrap`, `AppToaster`

### 6.4 דף נחיתה

- `components/landing/LandingPage.tsx` — למבקרים לא מחוברים ב־`/`

### 6.5 רכיבי UI משותפים (`components/ui/`)

כולל ספריית `bento/` (גרפים: Donut, Sparkline, BentoGrid וכו׳), `GlassPanel`, `empty-state`, `claude/`.

---

## 7. בינלאומיות (i18n)

- קבצי `messages/*.json` — לדוגמה: `he.json`, `en.json`, `ru.json`, `ar.json`, וכן מודולים: `workspace-shell`, `workspace-dock`, `workspace-areas`, `site-chrome`, `site-marketing`, `marketing-home`, `brand-brief`, `construction-trades`
- `lib/i18n/` — טעינה, משא ומתן לפי `Accept-Language`, עוגיית `COOKIE_LOCALE` (מ־`middleware`)

---

## 8. אבטחה וניתוב (Middleware)

- שימוש ב־`withAuth` מ־`next-auth/middleware`
- קידומי API שדורשים JWT תקף (401 JSON אם חסר):  
  `/api/ai`, `/api/analyze`, `/api/chat`, `/api/data`, `/api/crm`, `/api/erp`, `/api/assign-user`, `/api/integrations`, `/api/scan`, `/api/org/`, `/api/admin`, `/api/meckano`, `/api/billing`, `/api/quotes`, `/api/user`, `/api/analyze-queue`, `/api/reports`, `/api/telemetry`, `/api/debug-session`
- קידומים ציבוריים: `/login`, `/register`, `/legal`, …, `/api/auth`, `/api/register`, `/api/locale`, `/api/webhooks/`
- דף הבית `/` נשאר נגיש ללא חסימת middleware (הלוגיקה בצד הלקוח/דף)

---

## 9. מודל נתונים (Prisma) — תמצית

**ישויות מרכזיות:** `Organization`, `User`, `Account`, `Session`, `VerificationToken`, `Project`, `Task`, `Contact`, `Document`, `DocumentLineItem`, `DocumentScanCache`, `DocumentScanJob`, `ExpenseRecord`, `IssuedDocument`, `Quote`, `Invoice`, `InAppNotification`, `ActivityLog`, `CloudIntegration`, `FinancialInsight`, `ProductPriceObservation`, `MeckanoZone`, `OrganizationInvite`, `OSBillingConfig`, `ScanBundle`, `SubscriptionInvitation`, `Automation`, `AutomationRun`, `AICorrection`, `RateLimit`, `Setting`.

**Enums חשובים:** `UserRole` (כולל `SUPER_ADMIN`, `ORG_ADMIN`, …), `SubscriptionTier`, `CustomerType`, `CompanyType`, `DocType` / `DocStatus`, `ExpenseAllocation`, `ExpenseRecordStatus`, `CloudProvider`, `DocumentScanJobStatus`, `AccountStatus`.

---

## 10. סקריפטים (`scripts/`)

דוגמאות: `check-env-essential.mjs`, `prisma-generate-safe.mjs`, `seed-test-data.mjs`, `broadcast-inapp.mjs`, `delete-user-by-email.mjs`, `wipe-postgres-keep-owner.mjs`, סקריפטי Vercel env (push/pull/resync/wipe), `generate-pwa-icons.mjs`, `build-construction-trade-locales.mjs`, `lighthouse-sample.mjs`, `ensure-neon-direct-env.mjs`, ועוד.

---

## 11. נכסים ציבוריים (`public/`)

- `manifest.json`, `sw.js`, `offline.html` — PWA
- `icon-192.png`, `icon-512.png`, `og-image.png`
- `gemini-live/capture.worklet.js`, `gemini-live/playback.worklet.js`

---

## 12. בדיקות ואיכות

- **Jest** — `npm test`
- **Playwright** — `npm run test:e2e`, כולל `e2e/site-quality.spec.ts`
- **אימות מלא** — `npm run verify` / `verify:all`

---

## 13. תלויות עסקיות/טכנולוגיות בולטות (מ־`package.json`)

AI: `@ai-sdk/*`, `ai`, `@google/generative-ai`, `@google/genai`, `@anthropic-ai/sdk`, `openai`, `groq-sdk`, `@google-cloud/documentai`  
תשלומים: PayPal SDK, לוגיקת PayPlus בקוד  
מייל: `nodemailer`, `resend`  
PDF/דוחות: `jspdf`, `jspdf-autotable`, `@react-pdf/renderer`  
אחר: `firebase-admin`, `googleapis`, `bcryptjs`, `zod`, `@tanstack/react-query`, `recharts`, `leaflet`, `papaparse`, `mammoth`, `react-markdown`, `sonner`, `next-themes`

---

## 14. Cron (Vercel)

| נתיב | לוח זמנים (UTC לפי `vercel.json`) |
|------|-----------------------------------|
| `/api/cron/financial-insights` | `0 6 * * *` |
| `/api/analyze-queue/process` | `15 6 * * *` |

---

## 15. הגבלות והבהרות למסמך זה

1. המסמך מבוסס על **מבנה קבצים וסכימה** — לא כל endpoint תועד בפירוט שדות request/response; לאימות מלא יש לעבור קובץ־קובץ.
2. ייתכנו **כפילויות נתיב** (למשל `app\login` מול `app/login`, `app\page.tsx`) — ב-Windows הן אותה תיקייה; ב-Git/Linux כדאי לאחד.
3. תיקיות כמו `.next`, `node_modules` משתנות בבילד ואינן חלק מהאפיון הפונקציונלי.

---

*נוצר אוטומטית על בסיס סריקת הריפו — לעדכון שוטף שמור את המסמך מול `git` או הרץ סקריפט דומה.*
