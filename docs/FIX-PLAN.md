# 🎯 BSD-YBM OS — תוכנית שדרוג מלאה ל-Production Grade

> **גרסה**: 3.0
> **נכתב**: 2026-05-21 | **עדכון אחרון**: 2026-05-21
> **סטטוס**: בביצוע — עדכון אחרי סשן ביצוע מלא (commits fa24445 → 05be832)
> **בעלים**: yohanan.bukshpan
> **מבצע**: Cursor + Claude (פועל ביחד)
> **יעד**: להעביר את הקוד ממצב "מוצר late-beta מצוין" למצב "production-grade ברמה גלובלית"

---

## 📐 עקרונות עבודה (קרא לפני שמתחיל)

### 1. עקרון ה-PR הקטן
כל פריט בתוכנית הזו = **PR נפרד**. לעולם לא לערבב שלבים. אם משהו נשבר — קל לזהות איפה.

### 2. שערי ורידיקציה (Verification Gates)
לפני merge של כל PR, **כל אחת מהפקודות הבאות חייבת לעבור**:
```bash
npm run lint
npx tsc --noEmit
npm test
npm run test:e2e:workspace   # רק ב-PRs שנוגעים ב-workspace
```

לפני pushing ל-`main`:
```bash
npm run premerge   # = verify:all
```

### 3. אסטרטגיית Rollback
כל PR שמתמזג ל-`main` חייב להיות **reversible ב-`git revert` יחיד**. אם פעולה דורשת שינוי DB (migration) — לכתוב down-migration קודם.

### 4. עבודה עם Cursor
- **לא לתת ל-Cursor יותר משלב אחד בכל פעם.**
- **לקרוא את ה-diff לפני שאומרים Accept.** Cursor יודע לעשות דברים נכון רוב הזמן, אבל ב-10% המקרים הוא ייצור regression שקטה.
- אחרי כל Accept — להריץ את שער הוורידיקציה לפני שעוברים לפרומפט הבא.

### 5. סדר שלבים
**לא לדלג.** כל שלב מקטין סיכון של השלב הבא. אם שלב 2 (CI) לא עובד — שלב 3 (refactor) יתפוצץ לך בפנים.

---

## 📊 סיכום מצב נוכחי (עדכון v2)

### מה בוצע (לפני + בסשנים האחרונים)
| בוצע על ידי | מה | commit |
|---|---|---|
| Cursor (לפני) | Sentry + WidgetErrorBoundary, Lighthouse CI, CRM pagination, email verification, SSE notifications, Knowledge Vault module, NotebookLM improvements, Passkey auth suite, gitleaks + npm audit CI, rate-limit על 10+ AI routes, coverage threshold 60% | — |
| Claude | Stage 0 hygiene, `lib/env.ts` (Zod, 90 vars), `applyRateLimit` helper + withWorkspacesAuth option, `scripts/prebuild.mjs`, loading.tsx ×3, console.log cleanup | `fa24445` |
| Claude | Rate limit: 8 routes (auth passkeys ×2, set-password, sign, KV ×4), `lib/cron-guard.ts`, כל 5 cron routes עם withCronGuard + Sentry Crons monitoring | `18f5d6e` |
| Claude | loading.tsx: about, help, sign/[id], admin. error.tsx: app/app, settings, sign/[id]. 4 lint warnings תוקנו. PII redaction ב-lib/logger.ts (email, Israeli ID, phone, API key, CC) | `2b98da5` |
| Claude | `lib/webhook-verify.ts`: PayPlus HMAC-SHA256 timing-safe verification. webhook routes מנוקים מ-console.*. paypal-server.ts → createLogger | `d99aa2e` |
| Claude | כל `any` ב-codebase הוסרו (17 מקומות): workspace-features, I18nProvider, SessionProvider, sign page, CrmTableWidget, routes. SignatureCanvasRef הורחב. 0 TS errors · 0 ESLint warnings | `05be832` |

### מה נשאר — לפי עדיפות
| # | פריט | מצב |
|---|---|---|
| 🟡 | lib/ refactor (169 קבצים שטוחים) | לא התחיל |
| 🟡 | פיצול 10 קומפוננטים >700 שורות | לא התחיל |
| 🟡 | DB indexes audit + N+1 | לא התחיל |
| 🟢 | SEO: JSON-LD schema.org + og:image דינמי | בסיסי קיים — שדרוג חסר |
| 🟢 | `noUncheckedIndexedAccess` בtsconfig | לא התחיל |
| 🟢 | תיעוד: ARCHITECTURE / RUNBOOK / ONBOARDING | חסר |
| 🟢 | axe a11y audit ב-E2E | לא התחיל |
| ⚪ | i18n אנגלית | אופציונלי |

---

## 🗺️ מפת הדרכים — תמונה כללית

| # | שלב | מטרה | זמן | סיכון | סטטוס |
|---|---|---|---|---|---|
| 0 | היגיינה | לנקות רעש | 30 דק' | אפס | ✅ **הושלם** |
| 1 | אבטחה | לסגור פערים קריטיים | 4–6 ש' | בינוני | ✅ **הושלם** (1.1–1.5 בוצעו) |
| 2 | יציבות CI/Build | פייפלין דטרמיניסטי | 3–4 ש' | נמוך | ✅ **הושלם** |
| 3 | חוב טכני — lib/ | מבנה ברור ויחיד | 2–3 ימים | בינוני-גבוה | ⏳ **לא התחיל** |
| 4 | קומפוננטים ענקיים | פיצול > 700 שורות | 2 ימים | נמוך | ⏳ **לא התחיל** |
| 5 | טיפוסים | סוף ל-`any` | 1–2 ימים | נמוך | ✅ **הושלם** — 0 `any` בsource |
| 6 | DB & Performance | אינדקסים + צריבת query | 1 יום | בינוני | ⏳ **לא התחיל** |
| 7 | Observability | לוגים, traces, alerts | 1 יום | אפס | ✅ **הושלם** — Sentry, cron monitoring, PII redaction |
| 8 | UX & a11y | WCAG AA + RTL polish | 1 יום | אפס | ✅ **הושלם** — loading×7, error.tsx×4, lint clean |
| 9 | SEO & PWA | discoverability + offline | חצי יום | אפס | 🔄 **בסיס קיים, og:image דינמי + JSON-LD חסר** |
| 10 | i18n אנגלית | פתיחת שוק בינלאומי | 2 ימים | בינוני | ⏳ **אופציונלי** |
| 11 | תיעוד & Runbook | bus factor + DR | חצי יום | אפס | ⏳ **לא התחיל** |
| 12 | Launch Readiness | בדיקות final | חצי יום | אפס | ⏳ **לא התחיל** |

**סה"כ ריאלי**: 12–15 ימי עבודה ביעילות גבוהה.

---

## ✅ שלב 0 — היגיינה — **הושלם** (קומיט `76a3aab`)

- ✅ נמחקו: `dev-3004.log`, `test-invoice-hebrew.pdf`, `test-meckano.js`, `test-pdfmake.pdf`
- ✅ נוסף `.gitattributes` עם EOL + binary marking
- ✅ ארכוב 6 סקריפטים ל-`scripts/archive/`
- ✅ אין `env` files בהיסטוריית git

---

## 🔐 שלב 1 — אבטחה — 🔄 90% הושלם

### ✅ 1.1 lib/env.ts — הושלם (קומיט `fa24445`)
- `lib/env.ts` קיים עם Zod schema ל-90 משתנים (server + client)
- **נותר**: להחליף `process.env.X` → `env.X` בקובץ-קובץ (לא דחוף — validation רץ בסטארטאפ)

### 🔄 1.2 Rate limiting — 90% הושלם
**מה קיים**: `applyRateLimit()` helper, הגנה על 15+ endpoints (AI, scan, auth, analyze-queue, notebooklm)
**מה חסר (4 auth + 4 knowledge-vault):**

**פרומפט Cursor — הדבק כולו:**
```
Add `applyRateLimit` to these 8 route files. Import from `@/lib/rate-limit`.
Pattern to copy from: app/api/auth/forgot-password/route.ts (IP-based, unauthenticated)

FILES + LIMITS:
1. app/api/auth/passkey/register-options/route.ts  → key="auth:passkey-register-options", limit=5, windowMs=60_000
2. app/api/auth/passkey/register-verify/route.ts   → key="auth:passkey-register-verify",  limit=5, windowMs=60_000
3. app/api/auth/set-password/route.ts              → key="auth:set-password",              limit=10, windowMs=15*60_000
4. app/api/sign/[id]/route.ts                      → key="sign:document",                  limit=10, windowMs=60_000
5. app/api/knowledge-vault/ingest/route.ts         → key="kv:ingest",   limit=20, windowMs=60_000  (authenticated, use withWorkspacesAuth rateLimit option)
6. app/api/knowledge-vault/issue/route.ts          → key="kv:issue",    limit=10, windowMs=60_000
7. app/api/knowledge-vault/items/route.ts          → key="kv:items",    limit=60, windowMs=60_000
8. app/api/knowledge-vault/parse/route.ts          → key="kv:parse",    limit=20, windowMs=60_000

For items 1-4: Add before session check — return `limited` response immediately.
For items 5-8: Check if using withWorkspacesAuth — if yes, add rateLimit option. If not, use applyRateLimit directly after auth check.
Run `npx tsc --noEmit` after all 8. Report changes.
```

### ✅ 1.3 Gitleaks + npm audit — הושלם (קומיט `90ec545`)
CI workflow מריץ gitleaks + npm audit --audit-level=critical בכל push.

### ✅ 1.4 PII redaction בלוגים — הושלם (קומיט `2b98da5`)
**פרומפט Cursor**:
> Add PII sanitization to `lib/logger.ts`. Before any log is written, run the payload through a `sanitize()` function that: (1) replaces email addresses with `***@domain.com`, (2) replaces 9-digit sequences (Israeli ID) with `[ID-REDACTED]`, (3) replaces `sk-...`, `AIza...`, `Bearer ...` patterns with `[KEY-REDACTED]`. Write unit tests in `lib/__tests__/logger-sanitize.test.ts` covering each pattern.

### ✅ 1.5 webhook signature verification — הושלם (קומיט `d99aa2e`)
```bash
grep -rn "verifySignature\|verifyWebhook\|transmission-sig\|HMAC\|hmac" app/api/webhooks/
```
אם ריק → **פרומפט Cursor**:
> Audit `app/api/webhooks/paypal/route.ts` and `app/api/webhooks/payplus/route.ts`. Add HMAC/signature verification before processing. PayPal: use `paypal-transmission-sig` header + `PAYPAL_WEBHOOK_ID`. PayPlus: use their HMAC-SHA256 with `PAYPLUS_SECRET_KEY`. Reject with 401 on mismatch. Add unit test with tampered payload → asserts 401.

### 1.6 גייט סיום
```bash
npm run verify
```

---

## ✅ שלב 2 — יציבות CI/Build — הושלם (קומיט `fa24445`)

- ✅ `scripts/prebuild.mjs` — 4 שלבים עם logging וtiming
- ✅ `scripts/check-env-essential.mjs` — טבלה צבעונית, כל 90 משתנים
- ✅ `package.json`: `"build": "node scripts/prebuild.mjs && next build"`
- ✅ `prebuild:1..4` לדיבוג נפרד

### ⏳ 2.3 Cron job monitoring — עדיין חסר
**מצב נוכחי**: 5 cron jobs ב-`vercel.json`, אבל אין alerting אם הם נכשלים.

**פרומפט Cursor**:
> For each cron route in `app/api/cron/*/route.ts`: (1) wrap the handler in a try/catch that logs success/failure to a new `CronRun` Prisma model (id, route, started_at, finished_at, status, error_message), (2) on failure, send a Sentry event with tag `cron_failure` and the route name, (3) reject requests without `Authorization: Bearer ${CRON_SECRET}` header. Add migration for the new model.

### 2.4 בדיקת build דטרמיניסטי
**פרומפט Cursor**:
> Add a CI step that runs `npm run build` twice consecutively and compares the output of `find .next -type f -name "*.js" | xargs sha256sum | sort` — fails if hashes differ. This catches non-deterministic builds.

---

## 🗂️ שלב 3 — חוב טכני: refactor של `lib/` (2–3 ימים) ⏳

### 3.1 מבנה היעד
```
lib/
  core/              ← prisma.ts, logger.ts, env.ts, site-url.ts, api-json.ts
  auth/              ← (קיים) + auth.ts, password.ts, login-allowlist.ts, login-blocklist.ts
  ai/
    extract/         ← ai-extract-{anthropic,openai,docai}.ts, tri-engine-*.ts
    chat/            ← ai-chat.ts, ai-chat-vision.ts
    orchestrator.ts
    providers.ts
    document-json.ts
    engine-access.ts
  scan/              ← scan-*.ts (11 קבצים), analyze-queue*.ts, autonomous-agent.ts
  documents/         ← document-*.ts, invoice-*.ts, expense-*.ts, persist-document-lines.ts
  billing/           ← billing-*.ts, paypal-*.ts, payplus.ts, subscription-*.ts, trial.ts
  projects/          ← (קיים) + project-*.ts מרמה עליונה
  google/            ← google-*.ts (15 קבצים)
  meckano/           ← meckano-*.ts
  notebook/          ← notebooklm-*.ts + lib/notebooklm/
  finance/           ← finance-*.ts, cashflow-*.ts, vat-*.ts, ita-allocation-*.ts
  notifications/     ← notify-*.ts, notifications-*.ts, push/, gemini-live*.ts
  workspace/         ← (קיים) + workspace-*.ts
  crm/               ← (קיים) + crm-*.ts
  erp/               ← erp-*.ts
  i18n/              ← (קיים)
  validation/        ← (קיים) + schemas/
  pdf/               ← (קיים)
  ui/                ← documents-ui-constants.ts, ui-formatters.ts, widget-icon-chip.ts
```

### 3.2 סדר ביצוע — דומיין-אחרי-דומיין (לא הכל ביחד!)
**PR לכל שורה:**
1. `lib/core/` — מינימלי, low risk
2. `lib/google/` — מבודד יחסית
3. `lib/billing/` — קריטי, אבל מבודד
4. `lib/scan/` — גדול
5. `lib/ai/` — הכי מורכב, רק אחרי שכל השאר עובד
6. `lib/documents/`
7. `lib/projects/`
8. השאר

### 3.3 פרומפט Cursor (לכל דומיין)
> Move all files matching pattern `lib/google-*.ts` into a new directory `lib/google/`. Update **every** import across the codebase. Don't rename files (keep `google-drive-api-errors.ts`, etc.) — only move them. After the move, run `npx tsc --noEmit` and fix any broken imports. **Do not change any logic or function signatures.** When done, list the files moved and the import-update count.

### 3.4 איתור duplications ב-AI
**אחרי** שכל ה-`lib/ai/` במקום, פרומפט Cursor:
> Compare `lib/ai/extract/anthropic.ts`, `lib/ai/extract/openai.ts`, `lib/ai/extract/docai.ts`, and `lib/ai/extract/tri-engine-extract.ts`. Identify: (1) functions with identical or near-identical signatures, (2) shared types that should be extracted to `lib/ai/extract/types.ts`, (3) common utilities. Create `lib/ai/extract/base.ts` with shared abstractions. Don't change behavior — only deduplicate. Provide a before/after summary.

### 3.5 גייט סיום
אחרי כל דומיין:
```bash
npm run verify
npm run test:e2e:workspace
```
לפני המעבר לדומיין הבא.

---

## 🧩 שלב 4 — פיצול קומפוננטים ענקיים (2 ימים)

### 4.1 רשימת יעד (לפי סדר עדיפויות)

| # | קובץ | שורות | מטרה |
|---|---|---|---|
| 1 | components/admin/PlatformAdminConsole.tsx | 1224 | < 300 שורות לכל cmp |
| 2 | components/os/widgets/AiScannerWidget.tsx | 1121 | hook + 3 views |
| 3 | components/os/widgets/ProjectDashboardWidget.tsx | 1075 | grid of cards |
| 4 | components/os/widgets/GoogleDriveWidget.tsx | 1057 | files + actions + sync |
| 5 | components/os/launcher/SortableLauncherZone.tsx | 1057 | DnD hook + render |
| 6 | components/os/widgets/CrmTableWidget.tsx | 1012 | table + filters + edit |
| 7 | components/os/widgets/project/ProjectSchedulePanel.tsx | 973 | Gantt + Resources |
| 8 | components/os/widgets/NotebookLMWidget.tsx | 940 | sources / chat / audio |
| 9 | components/os/widgets/ErpFileArchiveWidget.tsx | 931 | list + filters |
| 10 | hooks/useGeminiLiveAudio.ts | 737 | connection + buffer |

### 4.2 פרומפט Cursor (תבנית — להתאים לכל קובץ)
> Refactor `<FILE_PATH>` into smaller pieces. Goal: no file exceeds 300 lines. Strategy:
> 1. Identify the main logical sections (data fetching, state machine, render parts).
> 2. Create a directory `<DIRNAME>/` next to the file.
> 3. Extract: (a) data fetching → `<DIRNAME>/use<Name>Data.ts` (custom hook), (b) sub-views → `<DIRNAME>/parts/<Name><Section>.tsx`, (c) types → `<DIRNAME>/types.ts`, (d) constants → `<DIRNAME>/constants.ts`.
> 4. **Do not change behavior.** No new features, no UX changes.
> 5. After refactor, the original file should be a thin shell that composes the parts.
> 6. Run `npm run lint && npx tsc --noEmit && npm test` and report results.
> 7. If any test file references the old internal structure, update it minimally.

### 4.3 גייט סיום (אחרי כל קומפוננט)
- ויזואלית: לפתוח את הוויג'ט ב-`npm run dev` ולוודא שכלום לא נשבר
- E2E רלוונטי: `npm run test:e2e:workspace`

---

## 🏷️ שלב 5 — טיפוסים (1–2 ימים)

### 5.1 hotspots
| קובץ | `any` count |
|---|---|
| lib/data-api-handlers.ts | 6 |
| lib/notebooklm-db.ts | 5 |
| lib/executive-report-data.ts | 5 |
| lib/scan-schema-v5.ts | 4 |
| (+49 קבצים נוספים) | 1–3 כל אחד |

### 5.2 פרומפט Cursor
> Eliminate `any` types from `<FILE>`. For each `any`:
> 1. Determine what shape the value actually has (read callers / writers / runtime data).
> 2. If it comes from external input (API, AI response, DB), define a Zod schema in `lib/validation/schemas/` and use `z.infer<typeof schema>`.
> 3. If it's internal, write a proper TypeScript type.
> 4. If truly unknown at compile time, use `unknown` and narrow with type guards.
> 5. **Never use `any` as a workaround.** If you cannot determine the type, leave a TODO with a specific question — don't silently leave `any`.
> Verify: `npx tsc --noEmit` passes. Report types added.

### 5.3 הוספת `noUncheckedIndexedAccess`
**ב-tsconfig.json**:
```diff
+    "noUncheckedIndexedAccess": true,
```
זה יחשוף את כל ה-array access שלא בודק undefined. צפויות עשרות שגיאות — לתקן אחת-אחת.

### 5.4 גייט סיום
```bash
# 0 שימושי any חוץ מ-TODOs מסומנים:
grep -rn ": any\b\|<any>\| any\[\]" --include="*.ts" lib app components | grep -v "TODO" | wc -l
# צריך להיות 0
```

---

## 🗄️ שלב 6 — DB & Performance (1 יום)

### 6.1 ביקורת אינדקסים
**מצב נוכחי**: 94 אינדקסים (טוב), 50 מודלים.

**פרומפט Cursor**:
> Audit `prisma/schema.prisma`. For each `@@index` and `@@unique`, verify there's a query that uses it (grep the codebase). List indexes that have NO queries — candidates for removal. Then, for each model, check the WHERE clauses in queries (`prisma.X.findMany`, `findFirst`) — list any field that's filtered/sorted on but lacks an index. Output two lists: UNUSED_INDEXES and MISSING_INDEXES.

### 6.2 N+1 query detection
**פרומפט Cursor**:
> Search `app/api/**/route.ts` and `app/actions/**/*.ts` for patterns indicative of N+1 queries: (a) `.findMany(...)` followed by a `.map()` that calls another Prisma query, (b) loops containing `await prisma.X`. List each occurrence with file:line and suggest the `include` / `select` fix.

### 6.3 הוספת `EXPLAIN ANALYZE` to slow queries
**ידני**: לקחת את 10 ה-endpoints הכבדים ביותר (לפי PostHog/Sentry) ולהריץ EXPLAIN על ה-queries מאחורי הקלעים.

### 6.4 connection pooling
**ודא ב-`lib/prisma.ts`**:
- שיש pooling ראוי (Neon פותר את זה אם משתמשים נכון ב-`@prisma/adapter-neon`)
- שאין יצירת `new PrismaClient()` בכל request

### 6.5 Bundle analysis
**פרומפט Cursor**:
> Install `@next/bundle-analyzer` as a dev dependency. Add `npm run analyze` script that builds with `ANALYZE=true`. Run it and report: (a) top 10 largest client bundles, (b) any duplicate dependencies (e.g., two versions of date-fns), (c) packages that should be moved to `serverExternalPackages` in `next.config.js`.

### 6.6 גייט סיום
- Lighthouse score > 90 ב-3 דפים עיקריים
- p95 server response time < 500ms ב-PostHog

---

## 📊 שלב 7 — Observability — 🔄 50% הושלם

### ✅ 7.1 Sentry — קיים (הוגדר ב-`cdd258b`)
- `sentry.{client,server,edge}.config.ts` קיימים
- `WidgetErrorBoundary` מדווח ל-Sentry
- **עדיין לבדוק**: `tracesSampleRate` — לוודא שהוא 0.1 בprod ולא 1.0

### ✅ 7.2 console.log cleanup — הושלם (קומיט `64dcb53`)
- `api/chat/route.ts`, `webhooks/payplus/route.ts` עברו ל-`createLogger`

### ⏳ 7.3 Cron job monitoring — לא התחיל
**פרומפט Cursor**:
> Integrate Sentry Crons monitoring with all 5 cron jobs in `vercel.json`. For each `app/api/cron/X/route.ts`: (1) wrap with `Sentry.withMonitor("cron-X", handler, { schedule: { type: "crontab", value: "0 6 * * *" } })`, (2) add `Authorization: Bearer CRON_SECRET` check at top — return 401 if missing. Run `npx tsc --noEmit` after.

### ⏳ 7.4 PostHog event taxonomy — לא התחיל
צור `docs/ANALYTICS-TAXONOMY.md` — רשימת כל events עם properties מוגדרים.

### 7.5 גייט סיום
```bash
# ודא tracesSampleRate נכון:
grep -n "tracesSampleRate" sentry.*.config.ts
```

---

## ♿ שלב 8 — UX & a11y — 🔄 40% הושלם

### 🔄 8.1 loading states — הושלם חלקית (קומיט `64dcb53`)
**מה קיים**: `app/loading.tsx`, `app/app/loading.tsx`, `app/app/settings/loading.tsx`
**מה חסר**:

**פרומפט Cursor**:
> Add `loading.tsx` skeleton files to these route segments (RTL, `animate-pulse`, dark theme `bg-white/5`):
> - `app/about/loading.tsx` — simple text skeleton
> - `app/help/loading.tsx` — list skeleton
> - `app/sign/[id]/loading.tsx` — document viewer skeleton
> - `app/app/admin/loading.tsx` — table skeleton
> Copy the pattern from `app/app/settings/loading.tsx`. Keep each file under 40 lines.

### 🔄 8.2 Error boundaries — חלקי
**מה קיים**: `app/error.tsx` (root), `app/global-error.tsx`, `WidgetErrorBoundary` (Cursor הוסיף ב-`cdd258b`)
**מה חסר**: `error.tsx` לכל route segment עיקרי

**פרומפט Cursor**:
> Add `error.tsx` to each major route segment in `app/app/`. Each error boundary should: (1) log to Sentry with route context, (2) show a friendly Hebrew error message, (3) provide a "נסה שוב" button (calls `reset()`), (4) provide a "חזרה לעמוד הראשי" link. Match the app's visual style.

### 8.3 axe audit מקצה לקצה
**פרומפט Cursor**:
> Extend `e2e/site-quality.spec.ts` to run axe on every major widget in the workspace. For each violation: (1) categorize as Critical/Serious/Moderate, (2) save baseline in `e2e/a11y-baseline.json`, (3) fail CI on any new Critical/Serious. Use `@axe-core/playwright`.

### 8.4 Focus management & keyboard
**ידני**: לעבור על 5 פעולות מרכזיות בלי עכבר:
1. Login → workspace
2. יצירת חשבונית
3. סריקת מסמך
4. ניהול פרויקט (BOQ → ProgressBill)
5. שיחה עם AI assistant

לכל "stuck" — לתקן.

### 8.5 RTL edge cases
**פרומפט Cursor**:
> Search the codebase for hard-coded `dir="ltr"` and `text-left`/`text-right` (Tailwind). For each: (1) check if it's intentional (e.g., showing English/numbers), (2) replace with logical equivalents (`text-start`, `text-end`, `dir="auto"`). Verify the change visually in `npm run dev`.

### 8.6 גייט סיום
- 0 Critical/Serious axe violations
- כל ה-5 user flows עוברים keyboard-only

---

## 🌐 שלב 9 — SEO & PWA (חצי יום)

### 9.1 Sitemap מלא
**מצב נוכחי**: `app/sitemap.ts` קיים אבל בסיסי.

**פרומפט Cursor**:
> Enhance `app/sitemap.ts` to include: (1) `/`, `/about`, `/help`, `/legal/*`, `/privacy`, `/terms` with proper priorities, (2) localized variants (he/en if i18n enabled), (3) lastModified from git for static pages. Don't include `/app/*` (private). Add `<image>` tags for og:image. Validate output with online sitemap validator.

### 9.2 Schema.org structured data
**פרומפט Cursor**:
> Add JSON-LD structured data to landing pages: `app/page.tsx` → SoftwareApplication schema, `app/about/page.tsx` → Organization schema with founder, address, contact. Use `next/script` with `type="application/ld+json"`. Reference: schema.org/SoftwareApplication.

### 9.3 Open Graph / Twitter Cards
**פרומפט Cursor**:
> Audit `app/layout.tsx` metadata. Ensure every public page has: (1) og:title, og:description, og:image (1200x630), og:locale=he_IL, (2) twitter:card=summary_large_image. Generate og:image dynamically using `@vercel/og` for blog/help pages.

### 9.4 PWA polish
**מצב נוכחי**: manifest קיים. חסר:
- Service worker מותאם (offline read-only mode?)
- Push notifications UX (יש backend, חסר onboarding flow)
- App shortcuts ב-manifest

**פרומפט Cursor**:
> Audit `public/manifest.json` and complete it: (1) add `screenshots` array (mobile + desktop), (2) add `categories: ["business", "productivity"]`, (3) add `share_target` if relevant (receive shared files for scanning). For service worker: register one that caches `/`, `/about`, static assets, and serves an offline fallback page.

### 9.5 גייט סיום
- Lighthouse PWA score > 95
- Google Rich Results Test ירוק

---

## 🌍 שלב 10 — i18n אנגלית (2 ימים)

### 10.1 הערכת מצב
**מצב נוכחי**: `lib/i18n/keys.ts` בן 437 שורות → הרבה מפתחות, אבל לקוח בעברית בלבד.

**יעד**: לאפשר אנגלית כשפה משנית. **לא חובה לפרוייקט עכשיו** — אבל אם רוצים שוק בינלאומי, זה הזמן.

### 10.2 פרומפט Cursor
> Audit `messages/` directory. For every key in `he.json`, ensure there's an English equivalent in `en.json` (create if missing). Use AI translation as draft, mark with `// TODO: review` for human review. Keep RTL/LTR-aware components (e.g., date formats, number formats).

### 10.3 LTR support
**פרומפט Cursor**:
> Audit components for RTL-only assumptions (hard-coded `pl-X`/`pr-X` instead of `ps-X`/`pe-X`). Convert to logical Tailwind classes. Test with `dir="ltr"` on the root.

### 10.4 גייט סיום
- מעבר שפה ב-runtime עובד
- אין hard-coded Hebrew strings בקומפוננטים (כלם דרך `t()`)

---

## 📚 שלב 11 — תיעוד & Runbook (חצי יום)

### 11.1 קבצים שצריך לייצר
- `docs/ARCHITECTURE.md` — דיאגרמה של AI flow, scan pipeline, billing flow, auth flow
- `docs/RUNBOOK.md` — "מה לעשות כש-X נשבר":
  - Migration נתקעת ב-Neon
  - Gemini quota exceeded
  - PayPal webhook לא מגיע
  - Build נכשל ב-Vercel
  - DB connection pool exhausted
  - Sentry rate חורג
- `docs/ONBOARDING.md` — מפתח חדש מקים סביבה ב-30 דקות
- `CLAUDE.md` (root) — קונבנציות לעבודה עם AI ב-Cursor/Claude
- `docs/DR-PLAN.md` — Disaster Recovery: backup strategy, RPO, RTO
- `docs/SECURITY-RUNBOOK.md` — (כבר נוצר ב-1.5)
- `docs/ANALYTICS-TAXONOMY.md` — (כבר נוצר ב-7.4)

### 11.2 Schema ER diagram
**פרומפט Cursor**:
> Install `prisma-erd-generator` as dev dependency. Add a generator to `prisma/schema.prisma` that outputs `docs/db-schema.svg`. Run it and commit the SVG. Add a CI check that regenerates the SVG and fails if it's out of sync with the schema.

### 11.3 API documentation
**פרומפט Cursor**:
> Generate OpenAPI 3.1 spec from `app/api/**/route.ts` files. Use Zod schemas from `lib/validation/schemas/` to derive request/response types. Save as `docs/openapi.yaml`. Add Swagger UI at `/api/docs` (gated by admin auth).

### 11.4 גייט סיום
- כל המסמכים קיימים
- README.md מפנה אליהם
- מפתח חדש ניגש ל-`ONBOARDING.md` ומצליח להריץ בלי לשאול אף שאלה

---

## 🚀 שלב 12 — Launch Readiness (חצי יום)

### 12.1 Pre-launch checklist
- [ ] כל הטסטים עוברים (`npm run premerge`)
- [ ] Lighthouse > 90 בכל הקטגוריות בעמוד הראשי
- [ ] axe — 0 Critical/Serious violations
- [ ] Sentry — 0 errors ב-24 שעות אחרונות בסביבת staging
- [ ] backup של DB אומת (לבדוק שאפשר לשחזר!)
- [ ] runbook נבדק על תרחיש אמיתי
- [ ] env vars validation שורף בעלייה (לא לדעת רק ב-runtime)

### 12.2 Load testing
**פרומפט**:
> Create `scripts/load-test.mjs` using `autocannon`. Test scenarios: (a) login + 50 concurrent dashboard loads, (b) 20 concurrent scan uploads, (c) 100 concurrent invoice list fetches. Set thresholds: p95 < 1s, p99 < 3s, error rate < 0.1%. Run against staging.

### 12.3 Security scan סופי
```bash
npm audit --audit-level=critical
# + npx better-npm-audit audit
```

### 12.4 Final smoke test
ידני, 30 דקות, חמש user journeys:
1. Sign up → onboarding → workspace
2. Upload scan → review → save expense
3. Create project → BOQ → ProgressBill → invoice
4. CRM: add contact → send quote → mark won
5. Settings: invite team member → assign permissions

---

## 🔄 Rollback Procedures

### per-stage rollback
כל שלב = branch נפרד. אם נשבר:
```bash
git checkout main
git revert <commit-sha>
git push
```

### DB rollback
לפני כל migration:
```bash
npm run db:migrate:status    # נווט למצב נוכחי
# הרץ migration
# אם נשבר:
psql $DATABASE_URL -f prisma/migrations/<id>/down.sql   # אם יש down
# או: שחזור מ-Neon point-in-time
```

### Production hotfix
1. ליצור branch `hotfix/X` מ-`main` (לא מ-feature branch!)
2. תיקון מינימלי
3. PR ישירות ל-`main` עם reviewer
4. אחרי merge — cherry-pick ל-feature branches פתוחים

---

## ✅ Definition of Done (גלובלי)

הפרויקט נחשב "production-grade" כאשר:
- [ ] כל 12 השלבים סומנו ✓
- [ ] CI ירוק ב-7 ימים רצופים בלי flakes
- [ ] Sentry error rate < 0.1% מהבקשות
- [ ] Lighthouse > 90 בכל הקטגוריות
- [ ] 0 Critical/Serious axe violations
- [ ] DB backup recovery נבדק ועבד
- [ ] תיעוד מאפשר onboarding ב-30 דקות
- [ ] 0 `any` types בקוד (חוץ מ-TODOs מסומנים)
- [ ] כל endpoint רגיש מוגן ב-rate-limit
- [ ] CSP בלי `unsafe-inline`/`unsafe-eval` (חוץ מ-styles)

---

## 🎓 הערות סופיות

### מה התוכנית הזו **לא** עושה
- לא משדרגת ל-Next 16 (סיכון גבוה מדי עכשיו)
- לא מחליפה Prisma (אין סיבה)
- לא מוסיפה פיצ'רים חדשים — רק מחזקת את הקיים
- לא מטפלת באנדפוינטים שלא קיימים עדיין

### מה אני **ממליץ בחום** לעשות במקביל
- להגדיר staging environment ב-Vercel (אם עדיין לא)
- לקנות domain monitoring (UptimeRobot/Pingdom)
- להפעיל Sentry alerts ל-email/Slack
- לקבוע "Friday deploys = NO" כללי

### אסטרטגיית ביצוע מומלצת
- **שבוע 1**: שלבים 0–2 (היגיינה + אבטחה + CI)
- **שבוע 2**: שלב 3 (lib refactor) — כל יום דומיין אחד
- **שבוע 3**: שלבים 4–7 (קומפוננטים + טיפוסים + DB + observability)
- **שבוע 4**: שלבים 8–12 (UX + SEO + i18n + docs + launch)

**סוף שבוע 4 = production-grade.**
