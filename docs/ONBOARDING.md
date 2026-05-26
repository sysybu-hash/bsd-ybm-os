# BSD-YBM Intelligence — Developer Onboarding

> **Last updated**: 2026-05-21  
> Welcome! This guide gets you from zero to a running local environment.  
> Estimated time: **30–45 minutes** for a clean setup.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Repo Setup](#2-repo-setup)
3. [Environment Variables](#3-environment-variables)
4. [Database Setup](#4-database-setup)
5. [Run Locally](#5-run-locally)
6. [Project Overview for New Devs](#6-project-overview-for-new-devs)
7. [Key Patterns to Know](#7-key-patterns-to-know)
8. [Development Workflow](#8-development-workflow)
9. [Testing](#9-testing)
10. [Common Gotchas](#10-common-gotchas)
11. [Useful Commands](#11-useful-commands)

---

## 1. Prerequisites

Install these before starting:

| Tool | Version | Install |
|---|---|---|
| Node.js | 20.x LTS | https://nodejs.org |
| npm | 10+ | bundled with Node |
| Git | any recent | https://git-scm.com |
| psql (optional) | any | for direct DB access |

You'll also need accounts at:
- **Neon** (free tier) — https://neon.tech — for PostgreSQL
- **Vercel** (optional, for preview deploys) — https://vercel.com
- At least **one AI API key**: Google AI Studio (Gemini) is free at https://aistudio.google.com

---

## 2. Repo Setup

```bash
# Clone
git clone <repo-url> bsd-ybm-os
cd bsd-ybm-os

# Install dependencies
npm install
```

---

## 3. Environment Variables

```bash
# Copy the example file
cp .env.example .env.local
```

Now edit `.env.local`. The **minimum required** to get the app running:

```env
# Database (get from Neon dashboard → Connection Details)
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"

# Auth (generate with: openssl rand -base64 32)
NEXTAUTH_SECRET="your-32-char-random-string"
NEXTAUTH_URL="http://localhost:3000"
AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"

# AI — at least one is required for AI features
GEMINI_API_KEY="AIza..."           # from aistudio.google.com (free)
# OPENAI_API_KEY="sk-..."          # optional fallback
# ANTHROPIC_API_KEY="sk-ant-..."   # optional fallback

# Cron (any string for local dev)
CRON_SECRET="local-dev-secret"
```

Run the audit to see what else you might need:
```bash
node scripts/check-env-essential.mjs
```

---

## 4. Database Setup

### Create a Neon Database

1. Go to https://neon.tech → New Project
2. Copy the connection string (pooled) → paste as `DATABASE_URL`
3. (Optional) Copy the direct connection string → paste as `DIRECT_URL`

### Run Migrations

```bash
npm run db:migrate
# equivalent: npx prisma migrate deploy (with .env.local)
```

This runs all existing migrations and creates all tables.

Recent product-brochure migration (contact tags + Meckano sync flags):

`prisma/migrations/20260526120000_contact_tags_meckano_sync/migration.sql`

### Google OAuth (Sign-in, Drive, Contacts import)

```env
# אינטגרציות (Drive reconnect, Contacts)
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# אופציונלי — Client נפרד לכניסה בלבד (מומלץ להסרת אזהרת Google ב-login)
# GOOGLE_SIGNIN_CLIENT_ID="..."
# GOOGLE_SIGNIN_CLIENT_SECRET="..."
```

- **מדריך מלא (עברית):** [GOOGLE-OAUTH.md](./GOOGLE-OAUTH.md) — scopes, Testing mode, אימות, שני Clients.
- **Runbook ידני:** [google-oauth-verification-runbook-he.md](./google-oauth-verification-runbook-he.md)
- **Drive**: reconnect בהגדרות → `/api/auth/google-reconnect`
- **Contacts (CRM)**: `/api/integrations/google/contacts/connect` — redirect: `{SITE_URL}/api/integrations/google/contacts/callback`

### Email (transactional mail)

Configure **one** transport in `.env.local` (see `.env.example`):

| Option | Variables |
|--------|-----------|
| **Resend** (recommended) | `RESEND_API_KEY` |
| **SMTP** | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, optional `SMTP_PORT`, `SMTP_SECURE` |

Optional sender overrides: `MAIL_FROM`, `MAIL_REPLY_TO` (defaults in `lib/mail-config.ts`).

**What sends mail automatically** (when transport is configured):

| Flow | Trigger |
|------|---------|
| Registration welcome / credentials | `POST /api/register` |
| Pending signup alert to platform admins | `POST /api/register` (FREE tier awaiting approval) |
| Password reset | `POST /api/auth/forgot-password` |
| Org team invite | Settings → invite member |
| Subscription tier invite | Platform admin subscriptions |
| Access approved | Admin approves pending user |
| Document scanned (ERP) | AI scan persist / tri-engine |
| Invoice / PayPal receipt | PayPal webhook |
| Collection reminder (PDF) | Cron + manual send |
| Important in-app notifications | `notifyUser` / org-wide alerts (tasks, signed quotes, price spikes) |

**Verify locally:**

```bash
node scripts/test-email.mjs your@email.com
```

**Verify in production:** Platform admin → test email (`POST /api/admin/test-email`).

Push to Vercel env: `npm run vercel:env:push:mail`

### Seed (Optional)

There is no seed script yet. To create a test organization:
1. Start the app (`npm run dev`)
2. Go to `/register` and create an account
3. Your org is auto-created on first login

### Prisma Studio (DB GUI)

```bash
npx prisma studio
# Opens at http://localhost:5555
```

---

## 5. Run Locally

```bash
npm run dev
# App starts at http://localhost:3000
```

The prebuild script runs automatically before `next dev`. If it fails, run:
```bash
node scripts/prebuild.mjs
```

---

## 6. Project Overview for New Devs

### What is this?

A **full-stack ERP/CRM/OS for Israeli construction businesses**. Think of it as:
- A workspace (like Notion) + CRM (like HubSpot) + invoicing (like FreshBooks) + AI document scanner — all in one, in Hebrew, with Israeli payment providers.

### Key Concepts

**OmniCanvas** — The main workspace UI. A drag-and-drop dashboard of "widgets" (AI chat, CRM, projects, invoices, etc.). Each widget is a React component under `components/os/widgets/`.

**Organizations** — Every user belongs to an Organization (workspace). All data is org-scoped. The `Organization` model is the tenant.

**Documents vs IssuedDocuments** — A `Document` is a raw scanned file. An `IssuedDocument` is a finalized invoice/quote PDF generated by the system.

**AI Scan Pipeline** — Upload a document → `DocumentScanJob` created → cron drains the queue → tri-engine AI extraction → `DocumentScanCache` stores results.

**Knowledge Vault** — An org-scoped RAG system. Documents are chunked, embedded with Gemini, stored in `KnowledgeVaultChunk`, and retrieved via cosine similarity for AI-assisted queries.

### Tech Stack in 30 Seconds

```
Next.js 15 (App Router) + React 18
  ↕ TanStack Query (data fetching)
  ↕ Prisma 6 (ORM)
  ↕ Neon PostgreSQL (DB)
  ↕ Gemini / OpenAI / Anthropic (AI)
  ↕ NextAuth v4 + Passkeys (auth)
  ↕ Tailwind CSS (styling)
  ↕ Sentry + PostHog (observability)
```

---

## 7. Key Patterns to Know

### Authenticated API Routes

All authenticated routes use `withWorkspacesAuth`:

```typescript
// app/api/some-feature/route.ts
import { withWorkspacesAuth } from "@/lib/api-handler";

export const POST = withWorkspacesAuth(async (req, { orgId, session }) => {
  // orgId is the authenticated org
  // session.user.id is the authenticated user
  const data = await req.json();
  // ... do stuff ...
  return Response.json({ ok: true });
}, {
  rateLimit: { key: "feature:action", limit: 20, windowMs: 60_000 }
});
```

**Never skip** `withWorkspacesAuth` on routes that touch org data.

### Logging (Not console.log!)

```typescript
import { createLogger } from "@/lib/logger";
const log = createLogger("my-feature");

log.info("thing_happened", { count: 5 });
log.warn("slow_query", { ms: 1200 });
log.error("fetch_failed", new Error("Network error"), { url });
```

PII is automatically redacted. Never log passwords, emails, or IDs directly.

### Environment Variables

```typescript
// Server-only
import { env } from "@/lib/env";
const key = env.GEMINI_API_KEY;

// Client-safe
import { clientEnv } from "@/lib/env";
const url = clientEnv.NEXT_PUBLIC_SITE_URL;
```

Don't use `process.env.X` directly — `lib/env.ts` validates at startup and gives typed access.

### Internationalization (i18n)

```typescript
// In any client component
const { t, locale, dir } = useI18n();
return <div dir={dir}>{t("some.key")}</div>;
```

Translation keys are in `lib/i18n/keys.ts`. Message files are in `public/messages/{locale}.json`.

### Error Boundaries

Every major route segment has an `error.tsx` that:
1. Captures to Sentry with route context
2. Shows a Hebrew recovery UI
3. Provides a "נסה שוב" (retry) button

---

## 8. Development Workflow

### Branch Naming

```
feature/short-description    # new features
fix/short-description        # bug fixes
chore/short-description      # maintenance
```

### Before Committing

```bash
npm run lint          # must be 0 warnings
npx tsc --noEmit      # must be 0 errors
npm test              # must pass
```

### Commit Message Format

```
type: short description

Longer explanation if needed.

Co-Authored-By: Name <email>
```

Types: `feat`, `fix`, `security`, `types`, `ux`, `seo`, `chore`, `docs`, `test`

### Code Review Checklist

- [ ] No `any` types introduced
- [ ] No `console.log` — use `createLogger`
- [ ] New API routes use `withWorkspacesAuth`
- [ ] New auth/public routes have rate limiting via `applyRateLimit`
- [ ] Error handling uses `unknown` not `any`
- [ ] RTL layout considered (Hebrew first!)
- [ ] Loading skeleton added for new route segments
- [ ] Sentry error boundary considered for new segments

---

## 9. Testing

### Unit Tests

```bash
npm test                # Run all unit tests
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
```

Tests live in `lib/__tests__/`, `app/**/__tests__/`.

Coverage threshold: **60%** (enforced in CI).

### E2E Tests

```bash
npm run test:e2e           # All E2E
npm run test:e2e:workspace # Workspace-specific tests
```

E2E uses Playwright. Tests in `tests/e2e/`.

### Lint

```bash
npm run lint         # ESLint
npx tsc --noEmit     # TypeScript check
```

---

## 10. Common Gotchas

### "DATABASE_URL must start with postgresql://"

Your `DATABASE_URL` in `.env.local` uses the wrong prefix. Neon uses `postgresql://` not `postgres://`.

### "NEXTAUTH_URL mismatch"

The `NEXTAUTH_URL` must exactly match the URL you're using to access the app (including port). For local dev: `http://localhost:3000`.

### Passkeys don't work locally

Passkeys require HTTPS or `localhost`. They won't work on `127.0.0.1` or custom hostnames without HTTPS.

### "Module not found: @/lib/..."

Run `npm install` and check that the path alias `@/` is configured in `tsconfig.json` (it is by default).

### AI features return errors

1. Run `node scripts/check-env-essential.mjs` — confirm at least one AI key is set
2. Check that the key is valid (not expired, has quota)
3. Gemini free tier has rate limits — if hitting them, add `OPENAI_API_KEY` as fallback

### Prisma type errors after schema change

```bash
npx prisma generate
```

Run this after any change to `prisma/schema.prisma` to regenerate the Prisma client types.

### Field Copilot / «שגיאה ביצירת סשן»

קופיילוט שטח דורש טבלאות `FieldCopilotSession` ו-`FieldCopilotAsset`. אחרי `git pull`:

```bash
npm run db:migrate
npm run db:migrate:status   # WebSocket ל-Neon ב-Windows
npx prisma generate
```

אל תשתמשו ב-`CREATE INDEX CONCURRENTLY` בתוך קבצי מיגרציה של Prisma — Neon מריץ מיגרציות ב-transaction. השתמשו ב-`CREATE INDEX IF NOT EXISTS` בלבד. ראו [PRODUCT-MAP.md](./PRODUCT-MAP.md).

### NextAuth `CLIENT_FETCH_ERROR` (תשובה לא JSON)

ודאו `NEXTAUTH_URL=http://localhost:3000` בפיתוח (לא רק `NEXT_PUBLIC_SITE_URL` של פרודקשן). אחרי עדכון קוד auth, `/api/auth/session` מחזיר JSON גם בשגיאת שרת.

### Hebrew text rendering is garbled

The app uses **Heebo** (Hebrew) and **Assistant** (Latin) fonts from Google Fonts. They're configured in `app/layout.tsx`. If fonts don't load, check your internet connection or the `next.config.js` CSP headers.

---

## 11. Useful Commands

```bash
# Development
npm run dev                    # Start dev server (http://localhost:3000)
npm run build                  # Production build
npm run start                  # Start production server locally

# Database
npx prisma studio              # Visual DB editor (http://localhost:5555)
npx prisma migrate dev         # Create new migration
npx prisma migrate deploy      # Apply pending migrations
npx prisma generate            # Regenerate client after schema change
npx prisma migrate status      # Check migration state

# Quality
npm run lint                   # ESLint
npx tsc --noEmit               # Type check
npm test                       # Unit tests
npm run test:e2e               # E2E tests
npm run audit:api              # Auth wrapper audit
npm run audit:rate-limits      # Rate limit audit
npm run audit:process-env    # מידע: process.env שנותרו (מסלול 10/10)
npm run verify                 # lint + tsc + audits + unit tests
npm run premerge               # verify + E2E (CI gate)

# Environment
node scripts/check-env-essential.mjs    # Audit all 90 env vars
node scripts/prebuild.mjs               # Run full prebuild pipeline

# Prebuild steps individually
npm run prebuild:1   # ensure-production-schema
npm run prebuild:2   # env:check
npm run prebuild:3   # embed-pdf-fonts
npm run prebuild:4   # prisma-generate-safe

# Debug
npx next info                  # Next.js environment info
npx prisma validate            # Validate schema without generating
```

---

## Getting Help

1. **Architecture questions** → `docs/ARCHITECTURE.md`
2. **Production issues** → `docs/RUNBOOK.md`
3. **Feature plan / backlog** → `docs/FIX-PLAN.md`
4. **Code question** → Search the codebase with `grep` or your editor's symbol search
5. **AI models behavior** → Check `lib/ai-orchestrator.ts` for the provider waterfall logic
