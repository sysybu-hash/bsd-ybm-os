# Self-Heal API — Security Model

Short reference for `POST /api/admin/self-heal`.

## Access control

- **withOSAdmin only** — platform admins (`OS_ADMIN_EMAIL` / `isAdmin`) via session; no org-role bypass.
- Unauthenticated or non-admin requests receive **403**.

## Dry-run default

- Request body `dryRun` defaults to **`true`**.
- Dry-run returns planned counts / samples only — **no mutations**.
- Set `dryRun: false` explicitly to apply an allowlisted action.

## Allowlist (no free SQL)

Only these `action` values are accepted:

| Action | Purpose |
|--------|---------|
| `purge_stale_rate_limits` | Delete `RateLimit` rows with `resetAt` older than 7 days |
| `recount_org_usage` | Sync `Automation.runCount` from `AutomationRun` totals (per org) |
| `requeue_failed_embeddings` | Re-embed `KnowledgeVaultChunk` rows missing JSON embedding (cap 50/run) |

Unknown actions return **400** with `unknown_action`.

## Audit

- Every invocation writes **`ActivityLog`** with action `SELF_HEAL_<action>` when admin user + org resolve.
- Details include `dryRun`, counts, and admin email (no secrets).

## Operational guidance

- Run **dry-run first** in production; review counts before apply.
- Prefer scheduled maintenance windows for `dryRun: false`.
- Do not expose this route to cron without explicit security review.
