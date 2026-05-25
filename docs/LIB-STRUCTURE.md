# מבנה `lib/` — מפת דומיינים (FIX-PLAN שלב 3)

> עדכון: 2026-05-24. מטרה: קבצים ≤300 שורות, ייבוא עקבי, ללא `process.env` ישיר.

## דומיינים עיקריים

| תיקייה | אחריות | דוגמאות |
|--------|---------|---------|
| `lib/ai/` | ספקי AI, orchestrator | `gemini.ts`, `orchestrator/` |
| `lib/analytics/` | PostHog client/server, אירועי מוצר | `posthog-client.ts`, `workspace-events.ts` |
| `lib/auth/` | NextAuth helpers | `session.ts` |
| `lib/field-copilot/` | קופיילוט שטח | `session-map.ts` |
| `lib/i18n/` | locales, RTL | `config.ts` |
| `lib/launcher/` | Launcher v2, Hub meta, picker | `user-launcher-config.ts`, `hub-meta.ts`, `picker-catalog.ts` |
| `lib/knowledge-vault/` | מאגר ידע | `service.ts` |
| `lib/os-assistant/` | פתיחת ווידג'טים, קטלוג | `resolve-widget-open.ts` |
| `lib/pdf/` | PDF | |
| `lib/tasks/` | משימות | |
| `lib/validation/` | Zod schemas | `schemas/` |
| `lib/workspace-api/` | API workspace | |

## קבצי שורש `lib/` (למיגרציה הדרגתית)

קבצים בודדים בשורש `lib/*.ts` יועברו לתיקיית דומיין ב-PRs קטנים. אל תעבירו יותר מדומיין אחד ל-PR.

## כללי ייבוא

```ts
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { withWorkspacesAuth } from "@/lib/api-handler";
```

## קומפוננטים >300 שורות

רוב הווידג'טים פוצלו לתת-תיקיות (`crm-table/`, `ai-scanner/`, `platform-admin/`). הרץ:

```bash
node scripts/lib-line-count.mjs --min 300
```

## PR checklist (שלב 3–4)

- [ ] `npm run lint` + `npx tsc --noEmit`
- [ ] E2E רלוונטי (`hubs`, `launcher-customization`)
- [ ] אין שינוי UX באותו PR כ-refactor
