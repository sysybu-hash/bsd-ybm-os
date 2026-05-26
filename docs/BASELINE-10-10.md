# Baseline 10/10 — 2026-05-26

מדידה ראשונית לפני מסלול [KPI-SIGNOFF](./KPI-SIGNOFF.md).

| מדד | תוצאה |
|-----|--------|
| קבצי TS/TSX (ללא node_modules) | ~1410 |
| קבצים ≥300 שורות | 27 — ראה [LIB-SPLIT-BACKLOG](./LIB-SPLIT-BACKLOG.md) |
| API audit (`audit-api-routes.mjs`) | 0 unprotected, 0 details leak |
| i18n parity en/ru vs he | 100% (918 keys) |
| Unit tests | 228/229 pass (לפני תיקון quick-grid) |
| ESLint | 16 warnings (0 errors) |
| `applyRateLimit` / `rateLimit:` ב-API | ~17 routes מפורשים → default ב-`withWorkspacesAuth` |

## Blockers ידועים

- Lighthouse ≥90 — לא נמדד מקומית בסשן זה; CI [lighthouse.yml](../.github/workflows/lighthouse.yml)
- Sentry 5xx% — דורש dashboard
- axe Critical/Serious — `e2e/workspace-a11y`

## שינויים לא committed

- `assets/` — לוגו רשמי (אם נדרש ב-UI)
