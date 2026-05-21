# CLAUDE.md — AI coding conventions for BSD-YBM OS

> This file is read automatically by Claude Code and Cursor when working in this repo.
> Keep it up-to-date so AI assistance stays aligned with our patterns.

---

## Tech stack at a glance

| Layer | Library / tool |
|-------|---------------|
| Framework | Next.js 15.5 (App Router) |
| React | 18, RSC + Client Components |
| DB | Neon serverless PostgreSQL via Prisma 6 |
| Auth | NextAuth v4 + SimpleWebAuthn (passkeys) |
| AI | Gemini 2.5 (primary), Anthropic Claude, OpenAI, Groq, Google DocumentAI |
| Payments | PayPal + PayPlus (Israeli) |
| Monitoring | Sentry + Sentry Crons, PostHog |
| Styling | Tailwind CSS, RTL-first (Hebrew) |
| Testing | Jest (unit), Playwright (E2E), @axe-core/playwright (a11y) |

---

## Non-negotiable rules — read before ANY change

### 1. TypeScript
- `strict: true` + `noUncheckedIndexedAccess: true` — both are on.
- No `any` types. Use `unknown` + type guards for truly dynamic shapes.
- For external API responses: define a Zod schema in `lib/validation/schemas/` and use `z.infer<>`.
- Array index access: use `arr[i]!` when bounds-checked, `arr[i] ?? fallback` otherwise.

### 2. Error handling
- All `catch` blocks: `catch (err: unknown)`, then `err instanceof Error ? err.message : String(err)`.
- Log with `createLogger("module-name")` from `lib/logger.ts` — **never** `console.log/error`.
- Sentry capture in error boundaries: `Sentry.captureException(error, { extra: { digest, route } })`.

### 3. Auth + API routes
- All authenticated API routes **must** use `withWorkspacesAuth()` from `lib/api-handler.ts`.
- Rate-limit every public-facing endpoint with `applyRateLimit()` from `lib/rate-limit.ts`.
- Pattern:
  ```ts
  export const POST = withWorkspacesAuth(async (req, { session, organizationId }) => {
    const limited = await applyRateLimit(req, "key:action", 10, 60_000);
    if (limited) return limited;
    // ...
  });
  ```

### 4. Environment variables
- Always read via `env.X` from `lib/env.ts` — never `process.env.X` directly.
- If you add a new env var, add it to `lib/env.ts` Zod schema AND `docs/ONBOARDING.md`.

### 5. Database
- One shared `PrismaClient` instance via `lib/prisma.ts` — never `new PrismaClient()` in routes.
- Write migrations as raw SQL in `prisma/migrations/` using `CONCURRENTLY IF NOT EXISTS` for indexes.
- Check for N+1: never call Prisma inside `.map()` — use `include` / batch queries.

### 6. i18n
- All user-visible strings via `t("key")` from `useI18n()` — no hard-coded Hebrew/English.
- RTL-aware: use `ps-*`/`pe-*` (logical) instead of `pl-*`/`pr-*` in Tailwind.
- Default locale: `he` (Hebrew, RTL). Secondary: `en`, `ru`.

### 7. Webhooks
- Verify HMAC before processing. PayPlus: `lib/webhook-verify.ts` → `verifyPayPlusWebhook()`.
- Read raw body once with `readRawBody()` before JSON parsing.

### 8. PII
- Logger auto-redacts: email, Israeli ID (9-digit), phone, API keys, credit cards.
- Never log session tokens, passwords, or raw webhook payloads.

### 9. Cron jobs
- All cron routes use `withCronGuard()` from `lib/cron-guard.ts`.
- Sentry Crons monitor each job (`Sentry.withMonitor(...)`).

### 10. Components
- Target: no component file > 300 lines. Extract hooks, sub-views, types.
- Error boundaries: every route segment needs `error.tsx` with Sentry capture.
- Loading states: every route segment needs `loading.tsx` with `animate-pulse` skeleton.

---

## Directory layout (key paths)

```
app/                    Next.js App Router pages + API routes
  api/                  API routes (all use withWorkspacesAuth)
  app/                  Authenticated workspace routes
components/
  os/                   OS shell — widgets, launcher, panels
  landing/              Marketing pages
  admin/                Platform admin console
hooks/                  Custom React hooks
lib/                    Server utilities (169 files — refactor in progress)
  ai/                   AI providers, orchestrator (partially migrated)
  auth/                 Auth helpers
  i18n/                 Translations + locale config
  validation/           Zod schemas
  pdf/                  PDF rendering
  tasks/                Task management
  workspace-api/        Workspace-level API helpers
  os-automations/       AI-driven OS commands
  launcher/             Widget launcher config
prisma/                 Schema + migrations
e2e/                    Playwright E2E tests
docs/                   ARCHITECTURE, RUNBOOK, ONBOARDING, DR-PLAN
```

---

## Commit conventions

```
feat(scope): short description
fix(scope): short description
chore(scope): maintenance
refactor(scope): no behavior change
test(scope): test changes only
docs(scope): documentation only
```

Co-Authored-By line is required on all AI-assisted commits:
```
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

## Common gotchas

1. **Prisma shadow DB**: Neon doesn't support shadow DB. Create migrations manually as SQL files in `prisma/migrations/` instead of using `prisma migrate dev`.
2. **`noUncheckedIndexedAccess`**: Array/record index returns `T | undefined`. Use `!` when bounds-checked in a loop, `?? fallback` otherwise.
3. **RTL icons**: Use `className="rtl:rotate-180"` on directional icons (arrows, chevrons).
4. **`force-dynamic`**: Add `export const dynamic = "force-dynamic"` to any route that reads cookies/session.
5. **PayPlus signature**: Always validate before processing. Dev mode allows missing header with a warning; prod rejects.
6. **Gemini model chain**: Try primary → fallback models. `isLikelyGeminiModelUnavailable()` detects quota errors.
7. **Tenant routing**: `lib/tenant-host.ts` controls multi-tenancy. Platform host check happens in `app/layout.tsx`.
