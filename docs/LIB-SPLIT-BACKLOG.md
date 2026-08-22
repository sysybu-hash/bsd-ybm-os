# Backlog — קבצים ≥300 שורות

עדכון: 2026-08-14 — `npm run lib:line-count` אחרי פיצול P4

**P4 (2026-08-14):** logic count 30 → **24** (יעד &lt;25 הושג)

| לפני | אחרי | פעולה |
|------|------|--------|
| 374 | 159 + 218 | `ai-providers.ts` → `ai-provider-models.ts` (קטלוג מודלים ושרשראות fallback) |
| 392 | 78 + 95 + 116 + 125 | `quick-grid.ts` → `-metrics` / `-slots` / `-edit` (barrel עם re-export) |
| 391 | 268 + 152 | `os-automations/registry.ts` → `registry-api-actions.ts` (מטפלים מבוססי API) |
| 346 | 246 + 117 | `scan/tri-engine-api-common.ts` → `tri-engine-persist-erp.ts` |
| 333 | 266 + 80 | `workspace/load-commercial-hub.ts` → `commercial-hub-types.ts` |
| 315 | 163 + 169 | `professions/runtime.ts` → `industry-profiles.ts` (טבלת פרופילי ענפים) |

כל הפיצולים הם חילוץ טהור עם `export *` / re-export — ללא שינוי התנהגות; `npm run verify` ירוק.

**P3 (2026-08-12):**

| לפני | אחרי | פעולה |
|------|------|--------|
| ~439 | ~420 | `useCrmTable.ts` → `useCrmGoogleImport.ts` (Google Contacts helpers) |

**יעד הבא:** `useCrmTable` (456), `useAppBuilder` (400), `ProgressBillPortalPanel` (385) — הוקים מונוליטיים.

**bulk OK (מוחרג מ-logic count):** `lib/help-center/content.*.ts`, `lib/i18n/keys.ts`, `lib/construction-trades-patches.ts`, `lib/pdf/product-brochure-v2-styles.ts`, `lib/pdf/brochure-styles/*`, `lib/pdf/product-brochure-html.ts`, `lib/pdf/marketing-onepager-html.ts`, `lib/pdf/system-specification-html.ts`, `lib/pdf/invoice-print-html.ts`.

**logic ≥300 שנותרו (מתוך ספירה אחרונה):**

| שורות | קובץ | שלב מוצע |
|------|------|----------|
| 392 | `lib/launcher/quick-grid.ts` | layout |
| 391 | `lib/os-automations/registry.ts` | registry split |
| 385 | `ProgressBillPortalPanel.tsx` | portal sections |
| 350 | `lib/projects/blueprint-analyze.ts` | instruction extract |
| 346 | `lib/ai-chat.ts` / `tri-engine-api-common` | scan/ai split |

---

**P2 (2026-07-15):** `useScanQueue`, `tri-engine-extract`, `product-brochure-v2-styles`, `blueprint-excel`, `launcher-icons` — ראה היסטוריית P2 בקומיטים קודמים.

**P0:** TakeoffModule, ProjectBoqPanel, BlueprintPreviewModal, ProjectBoardWidget, OmniCanvasWorkspace — הושלם 2026-07-05.

---

## 2026-08-23

| לפני | אחרי | פעולה |
|------|------|--------|
| 456 | 414 + 77 | `useCrmTable.ts` → `useCrmCsvTransfer.ts` (ייבוא/ייצוא CSV, לפי התקדים של `useCrmGoogleImport`) |

**היעד <25 עדיין לא הושג — logic count = 27.**

חשוב לדעת: הספירה עלתה מ-24 (חתימת 10/10 ב-2026-08-14) ל-27 **לפני** העבודה
הזו. `git checkout main && npm run lib:line-count` מחזיר גם הוא 27. העלייה
מקורה בעבודה שנכנסה בין החתימה להיום, לא בפיצול הזה.

הפיצול הנוכחי הוריד קובץ אחד מ-456 ל-414 — שיפור אמיתי בקריאוּת, אבל הוא
**לא מוריד את הספירה**, כי המדד סופר קבצים ≥300 ו-414 עדיין מעליו.

כדי לחזור מתחת ל-25 צריך להוריד שלושה קבצים אל מתחת ל-300. המועמדים הזולים
ביותר הם אלה שיושבים ממש על הסף:

| שורות | קובץ |
|---|---|
| 300 | `components/os/widgets/project-board/useProjectBoard.ts` |
| 301 | `components/os/NotificationCenter.tsx` |
| 301 | `components/os/widgets/project/gantt/GanttChartView.tsx` |
| 304 | `lib/professions/config.ts` |
| 305 | `components/os/widgets/project-dashboard/DashboardHeader.tsx` |
| 307 | `lib/api-handler.ts` |

**אזהרה:** לגזום קבצים שיושבים על 300-307 רק כדי לעבור מדד זה משחק במספר,
לא שיפור. עדיף לפצל את המונוליטים האמיתיים — `useAppBuilder` (400),
`ProgressBillPortalPanel` (385) — גם אם הספירה זזה לאט יותר.
