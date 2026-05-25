# Analytics Event Taxonomy — BSD-YBM OS

> **Version**: 1.0 | **Date**: 2026-05-21
> **Provider**: PostHog (client + server)
> **Client helper**: `lib/analytics/posthog-client.ts` → `captureProductEvent()`
> **Server helper**: `lib/analytics/posthog-server.ts` → `captureServerEvent()` (if exists)

All events follow the convention `noun_verb` (snake_case). Super-properties (set once per session) are listed in §6.

---

## 1. Authentication events

| Event | Trigger | Properties |
|-------|---------|-----------|
| `auth_login_started` | User clicks "Sign In" / submit email | `method: "google" \| "credentials" \| "passkey"` |
| `auth_login_success` | Session created | `method`, `is_new_user: boolean` |
| `auth_login_failed` | Auth error | `method`, `error_code: string` |
| `auth_register_started` | User opens registration form | — |
| `auth_register_success` | Account created | `plan: string` |
| `auth_passkey_enrolled` | Passkey credential saved | — |
| `auth_password_reset_requested` | Forgot password form submitted | — |
| `auth_logout` | Session destroyed | — |

---

## 2. Workspace / OS events

| Event | Trigger | Properties |
|-------|---------|-----------|
| `workspace_opened` | Workspace shell mounts | `locale`, `dir`, `widget_count: number` |
| `widget_opened` | Widget added to canvas | `widget_type: WidgetType`, `source: "launcher" \| "automation" \| "url"` |
| `hub_opened` | Hub widget opened (finance/projects/documents/ai) | `hub_type`, `source` |
| `launcher_widget_added` | User assigns tile in launcher edit mode | `widget_type`, `zone` |
| `session_create_failed` | Field copilot session POST failed | `reason`, `code` (server) |
| `widget_closed` | Widget removed | `widget_type` |
| `widget_maximized` | Widget toggled to full screen | `widget_type` |
| `launcher_customized` | User saves custom layout | `quick_grid_count: number`, `sidebar_count: number` |
| `omnibar_opened` | Command bar opened (keyboard or button) | — |
| `omnibar_command_used` | Command selected from omnibar | `command: string` |

---

## 3. AI / Chat events

| Event | Trigger | Properties |
|-------|---------|-----------|
| `ai_chat_message_sent` | User sends message to AI | `provider: string`, `message_length: number` |
| `ai_chat_response_received` | AI response returned | `provider`, `latency_ms: number`, `tokens: number` |
| `ai_chat_error` | AI request failed | `provider`, `error_type: string` |
| `gemini_live_session_started` | Voice session begins | `voice_name: string` |
| `gemini_live_session_ended` | Voice session ends | `duration_seconds: number` |
| `automation_action_executed` | AI executes an OS command | `intent: string`, `success: boolean` |

---

## 4. Scan events

| Event | Trigger | Properties |
|-------|---------|-----------|
| `scan_started` | User submits file(s) | `file_count: number`, `total_size_kb: number` |
| `scan_completed` | All files analyzed | `ok: number`, `failed: number`, `engine: string` |
| `scan_file_success` | Single file analyzed | `vendor: string \| null`, `amount: number \| null`, `engine: string` |
| `scan_file_error` | Single file failed | `error_code: string`, `engine: string` |
| `scan_expense_confirmed` | User confirms scanned expense | `amount: number`, `vendor: string` |
| `scan_expense_rejected` | User rejects scanned data | — |
| `drive_scan_triggered` | Google Drive file sent to scanner | `mime_type: string` |

---

## 5. Documents / ERP events

| Event | Trigger | Properties |
|-------|---------|-----------|
| `invoice_created` | Invoice issued | `amount: number`, `currency: string`, `client_type: string` |
| `quote_created` | Quote generated | `amount: number`, `ai_generated: boolean` |
| `document_signed` | Client signs document | `document_type: string` |
| `document_exported` | PDF/CSV exported | `format: "pdf" \| "csv"`, `document_type: string` |
| `project_created` | New project added | `industry: string` |
| `task_created` | Task added to project | `source: "manual" \| "ai"` |
| `crm_contact_created` | New CRM contact | — |
| `crm_deal_status_changed` | Contact status updated | `from: string`, `to: string` |

---

## 6. Billing / subscription events

| Event | Trigger | Properties |
|-------|---------|-----------|
| `subscription_plan_viewed` | Pricing page opened | `current_plan: string` |
| `subscription_upgrade_started` | User clicks upgrade | `target_plan: string`, `gateway: "paypal" \| "payplus"` |
| `subscription_upgrade_completed` | Payment success | `plan: string`, `amount: number`, `currency: string` |
| `subscription_cancelled` | Subscription cancelled | `plan: string`, `reason: string` |
| `trial_started` | Trial period begins | `plan: string`, `days: number` |
| `trial_expired` | Trial ended | `converted: boolean` |

---

## 7. Onboarding events

| Event | Trigger | Properties |
|-------|---------|-----------|
| `wizard_step` | Onboarding wizard step | `action: string`, `details: string` |
| `onboarding_completed` | Wizard fully completed | `steps_taken: number` |
| `onboarding_dismissed` | Wizard dismissed early | `step: number` |

---

## 8. Settings events

| Event | Trigger | Properties |
|-------|---------|-----------|
| `settings_locale_changed` | Language switched | `from: string`, `to: string` |
| `settings_theme_changed` | Theme toggled | `theme: "dark" \| "light" \| "system"` |
| `settings_team_member_invited` | Team invite sent | — |
| `settings_integration_connected` | Google/etc connected | `integration: string` |
| `settings_integration_disconnected` | Integration removed | `integration: string` |

---

## 9. Super-properties (set once per session)

Set via `posthog.identify()` after login:

| Property | Source |
|----------|--------|
| `organization_id` | Session |
| `organization_plan` | DB |
| `organization_industry` | DB |
| `locale` | Cookie |
| `user_role` | Session |
| `is_admin` | Session |

---

## 10. Implementation notes

1. **Client events**: call `captureProductEvent(event, properties)` from `lib/analytics/posthog-client.ts`.
2. **Server events**: use PostHog Node SDK in API routes (avoid in middleware — runs on edge).
3. **PII**: never include `email`, `name`, `phone`, `idNumber` in event properties. Use `organization_id` / anonymous IDs.
4. **Testing**: in test environment (`NODE_ENV=test`), PostHog is a no-op. Do not mock manually.
5. **New events**: add to this file before shipping — keeps taxonomy synchronized.
