# מפת מוצר — BSD-YBM OS (מרחב עבודה)

> עדכון: 2026-07-15 · Launcher v2 + Hub widgets + Onboarding v2 + Growth/KV/Phase 3–4

## אריחי מרכז (Quick Grid — ברירת מחדל)

| אריח | מה פותח | לשוניות / הערות |
|------|---------|------------------|
| **פיננסים** (`financeHub`) | דאשבורד + תזרים | `tab=overview` · `tab=cashflow` |
| **פרויקטים** (`projectsHub`) | לוח פרויקטים + מרכז שליטה | `tab=board` · `tab=project` + `projectId` |
| **CRM** (`crmTable`) | ניהול לקוחות | ללא Hub — חלון ישיר |
| **מסמכים** (`documentsHub`) | ארכיון · הפקה · סריקה | `tab=archive` · `tab=create` · `tab=scan` |
| **קופיילוט שטח** (`fieldCopilot`) | הצעות מהשטח | ענף בנייה בלבד |
| **בינה מלאכותית** (`aiHub`) | צ'אט · NotebookLM | `tab=chat` · `tab=notebook` |

## מיפוי ווידג'טים ישנים → Hub

| פתיחה ישנה (`?w=`) | יעד חדש |
|-------------------|---------|
| `dashboard` | `financeHub` + `tab=overview` |
| `cashflow` | `financeHub` + `tab=cashflow` |
| `projectBoard` | `projectsHub` + `tab=board` |
| `project` | `projectsHub` + `tab=project` |
| `erp` / `erpArchive` | `documentsHub` + `tab=archive` |
| `docCreator` / `quoteGen` | `documentsHub` + `tab=create` |
| `aiScanner` / `scan` | `documentsHub` + `tab=scan` |
| `aiChat` / `aiChatFull` | `aiHub` + `tab=chat` |
| `notebookLM` | `aiHub` + `tab=notebook` |

מימוש: [`lib/os-assistant/resolve-widget-open.ts`](../lib/os-assistant/resolve-widget-open.ts), [`lib/workspace-url.ts`](../lib/workspace-url.ts).

## כלים שלא אוחדו ל-Hub (ניווט נפרד)

| ווידג'ט | איפה למצוא | קישור ישיר |
|---------|------------|------------|
| **Google Drive** | סרגל צד · תפריט «עוד» במובייל | `/?w=googleDrive` |
| **דוחות Meckano** | סרגל · «עוד» | `/?w=meckanoReports` |
| **הגדרות** | סרגל | `/?w=settings` |
| **מרכז עזרה** | סרגל | `/?w=helpCenter` |
| **נגישות** | סרגל | `/?w=accessibility` |
| **ניהול מערכת** | אדמין בלבד | `/?w=platformAdmin` |

**חשוב:** Hub **מסמכים** ≠ Google Drive. מסמכים = ERP / מחולל / סורק בתוך המערכת.

## דוגמאות URL

```
/?w=financeHub&tab=overview
/?w=projectsHub&tab=board
/?w=documentsHub&tab=scan
/?w=aiHub&tab=chat
/?w=googleDrive
/?w=fieldCopilot
/?w=crmTable
```

## עריכת Launcher

- לחיצה ארוכה על רשת האריחים → מצב עריכה.
- ניתן להוסיף **Google Drive** וכל ווידג'ט מ-[`lib/os-assistant/widget-catalog.ts`](../lib/os-assistant/widget-catalog.ts).
- מפתח שמירה: `bsd_ybm_launcher_v2` (גרסה 1 לא ממוזגת אוטומטית — משתמשים עם פריסה ישנה מקבלים ברירת מחדל 6 Hub).

## משטחי צמיחה ו-Phase 3–4 (2026-07)

| משטח | נתיב / API |
|------|------------|
| Blog / Contact / Leads | `/blog`, `/contact`, lifecycle cron |
| Knowledge Vault | חיפוש סמנטי + `KnowledgeVaultPicker` |
| BOQ agent / Accounting export | API + E2E smoke |
| COMPANY_MGMT | מצב ניהול עסק — ראה `company-management-mode.md` |

## Onboarding

- `FirstDayWizard` — 5 שלבים (login → finance → scan → drive → fieldCopilot)
- `LauncherV2MigrationBanner` — באנר מיגרציה ל-launcher v2

## קישורים לתיעוד

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [ONBOARDING.md](./ONBOARDING.md) — מיגרציות DB, env
- [RUNBOOK.md](./RUNBOOK.md)
- [LAUNCH-CHECKLIST.md](./LAUNCH-CHECKLIST.md)
- [KPI-SIGNOFF.md](./KPI-SIGNOFF.md)
