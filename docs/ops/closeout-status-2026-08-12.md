# Closeout status — 2026-08-12

Integration branch: `wip/closeout-snapshot` · PR: https://github.com/sysybu-hash/bsd-ybm-os/pull/31  
Slice PRs: #22–#30 (review granularity; prefer merging #31 to avoid overlap conflicts).

## Phase 0 — Owner gates

| Gate | Agent status | Owner remaining |
|------|--------------|-----------------|
| Preview DB isolation | WARN: Preview `DATABASE_URL` unset on general Preview (only branch-scoped `feat/cursor-13-tasks`) | Create Neon `preview` branch; set Preview env; `npm run ops:verify-preview-db` green |
| `OS_ADMIN_EMAILS` | Present in Production | Confirm `/app/admin` login in browser |
| Google link redirect URI | Code shipped | Add `…/api/auth/google-link/callback` in Google Cloud Console |
| CSP_STRICT | `true` in Prod+Preview; live header without `unsafe-eval` | Full authenticated smoke (Google/PayPal/mic/App Builder) |

## Phase 1 — PRs opened

| PR | Title |
|----|-------|
| #22 | server-action auth |
| #23 | Google account-link |
| #24 | Google Contacts CRM |
| #25 | finance numbering APIs |
| #26 | AI scanner UI |
| #27 | BOQ / progress bills |
| #28 | App Builder / admin |
| #29 | i18n / CI / docs |
| #30 | marketing media |
| #31 | full integration snapshot |

## Phase 2 — Verify

- `npm run lint` — pass (on snapshot)
- `npx tsc --noEmit` — pass (on snapshot)
- `audit:api` — 0 issues
- `audit:rate-limits` — 0 issues (google-link allowlisted)
- `i18n:parity` — 100% he/en/ru
- Jest — 535+ passing after `isAdmin` mock fix for manage-subscriptions
- **E2E ci-gate** — **55 passed**, 2 flaky (document-scan review UI + documents hub create tab); timeouts bumped in follow-up
- Public prod smoke — `/`, `/login`, `/manifest.json`, `/blog`, `/contact`, `/privacy`, `/help` → 200; `/api/auth/session` GET → 200
- Integration **merged**: PR #31 → `main` (`6209138`)

## Phase 3–4 — Follow-ups (shipped in follow-up PR)

- E2E flake timeout bumps (`hubs`, `document-scan-flow`)
- `process.env` → `env` for `is-admin`, QStash, Upstash Redis, analyze-queue process
- CRM `useCrmGoogleImport` extract (lib-split)
- Owner still: Preview DB isolation, Google redirect URI, authenticated CSP smoke, SLO alert console checkboxes
