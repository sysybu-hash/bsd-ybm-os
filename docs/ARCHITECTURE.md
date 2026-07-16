# BSD-YBM Intelligence — Architecture Overview

> **Last updated**: 2026-05-21  
> **Version**: 1.0  

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Tech Stack](#2-tech-stack)
3. [Directory Structure](#3-directory-structure)
4. [API Layer](#4-api-layer)
5. [Data Model (Prisma)](#5-data-model-prisma)
6. [AI Engine Architecture](#6-ai-engine-architecture)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [Payments](#8-payments)
9. [Background Jobs (Cron)](#9-background-jobs-cron)
10. [Observability](#10-observability)
11. [Multi-tenancy](#11-multi-tenancy)
12. [Deployment](#12-deployment)
13. [Security Controls](#13-security-controls)

---

## 1. System Overview

BSD-YBM Intelligence is a **Hebrew-first, RTL** ERP/CRM/OS built for Israeli construction businesses. It is a full-stack SaaS web application delivered as a single Next.js application deployed to Vercel with a Neon (serverless Postgres) database backend.

```
                        ┌─────────────────────────┐
  Browser / PWA ───────▶│  Next.js 15.5 App Router │
                        │  (Vercel Edge + Node.js)  │
                        └──────────┬──────────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            │                      │                      │
      Neon Postgres          Upstash Redis          Firebase / GCS
      (Prisma 6 ORM)         (Rate limiting)        (Push, Storage)
            │
   ┌────────┴────────┐
   │  External APIs  │
   │  ─────────────  │
   │  Gemini 2.5     │
   │  OpenAI         │
   │  Anthropic      │
   │  Groq           │
   │  Google DocAI   │
   │  PayPal         │
   │  PayPlus (IL)   │
   │  Meckano (IL)   │
   │  Google Drive   │
   └─────────────────┘
```

**Core domains:**
- **CRM** — Contacts, leads, client lifecycle
- **ERP** — Projects, BOQ, Progress Bills, Expenses
- **Documents** — Quotes, Invoices, Issued Documents (PDF/HTML)
- **AI Scan** — Multi-engine document processing (Gemini + OpenAI + DocAI)
- **Knowledge Vault** — Org-scoped embedding/RAG store
- **Billing** — PayPal + PayPlus payment processing, subscription management
- **Automation** — Low-code rules engine for workspace automations
- **Observability** — Sentry, PostHog, Lighthouse CI, Sentry Crons

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15.5 (App Router, RSC) |
| UI | React 18 + Tailwind CSS 3 + Radix UI headless |
| State / Data | TanStack Query v5 (server state), React state (local) |
| ORM | Prisma 6 + `@prisma/adapter-neon` |
| Database | Neon serverless PostgreSQL (embeddings as JSON + JS cosine; native pgvector deferred) |
| Cache / Rate-limit | Upstash Redis (HTTP, serverless-safe) |
| Auth | NextAuth v4 + `@next-auth/prisma-adapter`, WebAuthn/Passkeys via `@simplewebauthn` |
| AI (primary) | Google Gemini 2.5 Flash/Pro via `@google/genai` + `@ai-sdk/google` |
| AI (secondary) | OpenAI GPT-4o via `openai` + `@ai-sdk/openai` |
| AI (tertiary) | Anthropic Claude via `@anthropic-ai/sdk` |
| AI (fast) | Groq Llama 3 via `groq-sdk` |
| Document AI | Google Cloud Document AI (`@google-cloud/documentai`) |
| PDF | `@react-pdf/renderer`, `jspdf`, `@sparticuz/chromium` |
| Payments | PayPal (`@paypal/react-paypal-js`) + PayPlus (REST) |
| Push | Firebase Admin + Web Push |
| Storage | Google Cloud Storage / Google Drive API |
| Monitoring | `@sentry/nextjs`, PostHog, Lighthouse CI |
| i18n | Custom translate layer (`lib/i18n/`) — Hebrew / English / Russian |
| Drag & Drop | `@dnd-kit/core` |
| Animation | Framer Motion |
| Email | Nodemailer |
| Deployment | Vercel (Edge Functions + Serverless) |

---

## 3. Directory Structure

```
app/
  (public routes)/          ← about, help, login, register, sign/[id]
  api/
    ai/                     ← AI endpoints (chat, assistant, scan)
    auth/                   ← passkey, set-password, reset-password, ...
    billing/                ← subscription, paypal, payplus
    cron/                   ← scheduled jobs (financial-insights, task-reminders, ...)
    crm/                    ← contacts, import
    documents/              ← issued docs, PDF export
    erp/                    ← quotes, notebook, ...
    knowledge-vault/        ← ingest, items, parse, issue
    og/                     ← dynamic OG image generation
    projects/               ← project CRUD + BOQ
    scan/                   ← document scan queue
    webhooks/               ← paypal, payplus
    ...
  app/                      ← authenticated workspace (OmniCanvas)
    admin/                  ← platform admin (super-admin only)
    settings/               ← user/org settings
  error.tsx                 ← root error boundary (Sentry + Hebrew UI)
  loading.tsx               ← root loading skeleton
  layout.tsx                ← root layout (auth, i18n, theme, providers)
  opengraph-image.tsx       ← dynamic OG card (edge)

components/
  admin/                    ← PlatformAdminConsole
  brand/                    ← BrandLogo, BrandHomeLink
  legal/                    ← CookieConsentBanner
  os/
    layout/                 ← OmniCanvasWorkspace, MobileBottomNav
    launcher/               ← LauncherConfigProvider, tiles, drag zones
    system/                 ← I18nProvider, SessionProvider, ThemeProvider, ...
    widgets/                ← All workspace widgets (AiChatFullWidget, CrmTableWidget, ...)
  seo/                      ← StructuredDataScript
  tenant/                   ← TenantContext
  ui/                       ← Shared primitives (Button, Dialog, ...)

lib/
  ai/                       ← (flat for now) ai-chat.ts, ai-orchestrator.ts, ...
  auth/                     ← (via lib/auth.ts, lib/passkeys.ts)
  google-publish/           ← structured-data.ts, seo-content.ts, public-page-metadata.ts
  i18n/                     ← config.ts, keys.ts, translate.ts, load-messages.ts
  pdf/                      ← PDF generators
  projects/                 ← project-specific logic
  push/                     ← push notifications, work-diary rules
  validation/               ← Zod schemas
  ...                       ← 169 flat files (Stage 3 refactor planned)

prisma/
  schema.prisma             ← Single schema, 50+ models
  migrations/               ← Versioned SQL migrations

scripts/
  prebuild.mjs              ← 4-step build preparation
  check-env-essential.mjs   ← 90-var env audit with colored table
  archive/                  ← Legacy one-shot scripts

types/
  react-signature-canvas.d.ts
  next-auth.d.ts
  ...

docs/
  ARCHITECTURE.md           ← (this file)
  RUNBOOK.md
  ONBOARDING.md
  FIX-PLAN.md
```

---

## 4. API Layer

### Pattern: `withWorkspacesAuth`

All authenticated API routes use the `withWorkspacesAuth` higher-order function from `lib/api-handler.ts`:

```typescript
export const POST = withWorkspacesAuth(
  async (req, { orgId, session }) => {
    // handler — orgId is always the verified tenant org
  },
  {
    rateLimit: { key: "feature:action", limit: 20, windowMs: 60_000 },
  },
);
```

**What it does:**
1. Validates NextAuth JWT session
2. Resolves `orgId` from session (verified against DB)
3. Applies per-user rate limiting (via Upstash Redis or Prisma `RateLimit` table)
4. Returns structured JSON errors with Hebrew messages

### Rate Limiting

Two strategies:
- **IP-based** (`applyRateLimit` from `lib/rate-limit.ts`) — for unauthenticated endpoints (auth, sign)
- **User-ID-based** (`rateLimit` option in `withWorkspacesAuth`) — for authenticated endpoints

All violations log to `createLogger("rate-limit")` with `Retry-After` headers returned.

### Cron Routes

All 5 cron routes are protected via `withCronGuard` (`lib/cron-guard.ts`):
- Requires `Authorization: Bearer CRON_SECRET`
- Wrapped with `Sentry.withMonitor()` for Sentry Crons health checks
- Structured logging: `cron_start`, `cron_success`, `cron_failure`

---

## 5. Data Model (Prisma)

**Key models:**

| Model | Purpose |
|---|---|
| `User` | Auth identity, email, password hash, passkeys |
| `Organization` | Tenant workspace, branding, subscription |
| `Contact` | CRM contacts (leads, clients) |
| `Project` | Construction project with BOQ and milestones |
| `Document` | Raw scanned/uploaded document |
| `IssuedDocument` | Finalized invoices/quotes with PDF |
| `Quote` | Pre-issue quote for client signature |
| `Invoice` | Issued invoices, PayPlus/PayPal transaction IDs |
| `DocumentScanJob` | AI scan queue entry (pending/processing/done) |
| `DocumentScanCache` | Cached AI extraction result |
| `KnowledgeVault*` | Embedded document chunks for RAG |
| `Task` | Org-scoped tasks with reminders |
| `WorkDiary` | Daily work log entries with push reminders |
| `Automation` | Trigger/action rules for workspace automation |
| `RateLimit` | Serverless-safe rate limit counters |
| `OSBillingConfig` | Per-org billing/subscription state |
| `PushSubscription` | Web Push endpoint registrations |
| `FinancialInsight` | AI-generated daily financial summaries |

**Database**: Neon serverless Postgres (connection pooling via `@prisma/adapter-neon`). Embeddings stored as JSON with in-process cosine similarity; native pgvector is intentionally deferred.

---

## 6. AI Engine Architecture

### Tri-Engine Orchestrator (`lib/ai-orchestrator.ts`)

Document scans route through a waterfall:
```
Gemini 2.5 Flash → (fallback) OpenAI GPT-4o → (fallback) Google Document AI
```

Each engine has a `confidence` score; if < threshold, the next engine is tried. Results are cached in `DocumentScanCache`.

### AI Chat (`lib/ai-chat.ts`)

Multi-provider streaming chat:
- Default: **Gemini 2.5 Flash** (fastest, Hebrew-optimized)
- Alternative: **OpenAI GPT-4o** or **Anthropic Claude 3.5**
- Fast: **Groq Llama 3** (sub-200ms)

### Gemini Live Audio (`hooks/useGeminiLiveAudio.ts`)

WebSocket-based real-time voice assistant using Google's Gemini Live API. State machine: `idle → connecting → active → fallback`.

### Knowledge Vault (RAG)

Org-scoped retrieval-augmented generation:
1. **Ingest**: Upload document → chunk → embed (Gemini `text-embedding-004`) → store in `KnowledgeVaultChunk`
2. **Query**: Embed user question → cosine similarity search → top-k chunks → prompt assembly → Gemini response

---

## 7. Authentication & Authorization

### Auth Flow

```
Login form / Google OAuth
        │
  NextAuth v4 (JWT strategy)
        │
  Prisma adapter (sessions persisted)
        │
  Session cookie (HTTP-only, Secure, SameSite=Lax)
```

### Passkeys (WebAuthn)

Implemented via `@simplewebauthn/server` (server) + `@simplewebauthn/browser` (client):
- `UserPasskey` model stores credential ID, public key, counter
- Supported on all modern browsers (Touch ID, Face ID, Windows Hello)

### Authorization Layers

| Level | Mechanism |
|---|---|
| Unauthenticated | Public routes (`/about`, `/help`, `/sign/[id]`) |
| Authenticated | `withWorkspacesAuth` checks valid session |
| Org-scoped | All DB queries filter by `organizationId` from session |
| Admin | `isAdmin(email)` check against `ADMIN_EMAILS` env var |
| Cron | `Authorization: Bearer CRON_SECRET` header |
| Webhooks | HMAC-SHA256 (`PAYPLUS_SECRET_KEY`) / PayPal signature API |

---

## 8. Payments

### PayPal
- Order creation: `lib/paypal-server.ts` → `/v1/payments/orders`
- Capture: client-side + server verify
- Webhook: `/api/webhooks/paypal` — verifies via PayPal's `verify-webhook-signature` endpoint (requires `PAYPAL_WEBHOOK_ID`)
- Applies: `applyPayPalCaptureResult()` → updates `Invoice.status = PAID`

### PayPlus (Israeli)
- Payment page generation: `lib/payplus.ts` → PayPlus REST API
- Webhook: `/api/webhooks/payplus` — HMAC-SHA256 verification with `PAYPLUS_SECRET_KEY`
- Signed with timing-safe compare (`crypto.timingSafeEqual`)

---

## 9. Background Jobs (Cron)

All scheduled via `vercel.json` crons (Jerusalem timezone, UTC times):

| Slug | Schedule | What |
|---|---|---|
| `cron-financial-insights` | `0 6 * * *` (09:00 IL) | AI-generated daily financial summary per org |
| `cron-analyze-queue` | `15 6 * * *` (09:15 IL) | Drain document scan queue (30 jobs/run) |
| `cron-task-reminders` | `0 7 * * *` (10:00 IL) | Push/email task reminders due today |
| `cron-collection-reminders` | `0 8 * * 0` (11:00 IL Sun) | Weekly collection follow-up emails |
| `cron-work-diary-push` | `0 16 * * *` (19:00 IL) | Daily work diary prompt push notifications |
| `cron-meckano-sync` | `0 5 * * *` (08:00 IL) | Meckano attendance sync |
| `cron-field-copilot-followups` | `0 8 * * *` (11:00 IL) | Field copilot follow-up prompts |
| `cron-google-calendar-sync` | `0 4 * * *` (07:00 IL) | Pull Google Calendar into workspace |
| `cron-google-calendar-push` | `30 4 * * *` (07:30 IL) | Push workspace events to Google Calendar |

All monitored via **Sentry Crons** (check-in margin 5 min, max runtime 25 min).

---

## 10. Observability

| Tool | What |
|---|---|
| **Sentry** | Error tracking (client + server + edge), Cron health checks, `captureException` in error boundaries |
| **PostHog** | Product analytics, custom events via `captureProductEvent()` |
| **Logger** (`lib/logger.ts`) | Structured JSON logs → console (Vercel drain) + PostHog + Sentry. **PII is automatically redacted** (emails, Israeli IDs, phone numbers, API keys, credit card numbers) |
| **Lighthouse CI** | Performance/a11y scores gated in CI pipeline |

### PII Redaction

`lib/logger.ts` sanitizes all log fields before any output:
- Email addresses → `[EMAIL]`
- 9-digit Israeli IDs → `[IL_ID]`
- Israeli phone numbers → `[PHONE]`
- API keys (`sk-*`, `AIza*`, `ya29.*`) → `[API_KEY]`
- Credit card numbers → `[CC_NUMBER]`
- Keys named `password`, `secret`, `token`, `apikey`, `authorization`, `credential` → `[REDACTED]`

---

## 11. Multi-tenancy

The system supports **host-based tenancy**:

1. Every incoming request reads `x-forwarded-host` / `host`
2. `resolveTenantByHost(host)` looks up `Organization` by custom domain
3. If no tenant and host is not the platform host → redirect to `TENANT_FALLBACK_REDIRECT`
4. Tenant branding (colors, logo) injected as CSS custom properties via `tenantBrandingCssVars()`

All `Organization` records are isolated — every DB query includes `organizationId` filter.

---

## 12. Deployment

**Platform**: Vercel  
**Region**: Auto (closest to Neon database)  
**Node.js runtime**: 20.x  
**Edge runtime**: Used for OG image routes, lightweight middleware

### Build Pipeline

```
npm run build
  └─▶ node scripts/prebuild.mjs
        ├─ [1/4] ensure-production-schema   (prisma schema check)
        ├─ [2/4] env:check                  (90-var audit)
        ├─ [3/4] embed-pdf-fonts            (PDF font embedding)
        └─ [4/4] prisma-generate-safe       (prisma generate)
  └─▶ next build
```

### Environment Variables

See `scripts/check-env-essential.mjs` for the full 90-variable audit.  
Critical ones:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection (pooled) |
| `NEXTAUTH_SECRET` / `AUTH_SECRET` | JWT signing (either works) |
| `GEMINI_API_KEY` | Primary AI engine |
| `CRON_SECRET` | Protects cron routes from public access |
| `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` | Error monitoring |
| `PAYPAL_WEBHOOK_ID` | PayPal webhook signature verification |
| `PAYPLUS_SECRET_KEY` | PayPlus HMAC-SHA256 webhook verification |

---

## 13. Security Controls

| Control | Implementation |
|---|---|
| Rate limiting | IP-based (unauthenticated) + user-based (authenticated) via `applyRateLimit` / `withWorkspacesAuth` |
| Webhook verification | PayPal: server-side signature API. PayPlus: HMAC-SHA256 + `timingSafeEqual` |
| PII in logs | Automatic redaction in `lib/logger.ts` |
| Secret scanning | Gitleaks in CI on every push |
| Dependency audit | `npm audit --audit-level=critical` in CI |
| Auth brute-force | Rate limits on all auth endpoints (5–10 req/min) |
| Session | HTTP-only cookies, short-lived JWT, `refetchInterval=5min` |
| Passkeys | WebAuthn Level 2, stored public key only (no secrets in DB) |
| DB | All queries org-scoped, Prisma parameterized (no raw SQL in app code) |
| Env validation | Zod schema at startup (`lib/env.ts`) — throws on missing critical vars |
