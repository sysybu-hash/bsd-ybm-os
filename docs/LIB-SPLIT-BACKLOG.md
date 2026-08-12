# Backlog — קבצים ≥300 שורות

עדכון: 2026-08-12 — `npm run lib:line-count` אחרי closeout

**P3 (2026-08-12):**

| לפני | אחרי | פעולה |
|------|------|--------|
| ~439 | ~420 | `useCrmTable.ts` → `useCrmGoogleImport.ts` (Google Contacts helpers) |

**יעד:** logic count &lt; 25 · המשך פיצול `quick-grid`, `registry`, `ProgressBillPortalPanel` (גדל ב-closeout).

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
