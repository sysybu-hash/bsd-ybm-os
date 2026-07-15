# Backlog — קבצים ≥300 שורות

עדכון: 2026-07-15 — `node scripts/lib-line-count.mjs --min 300`

**יעד הושג:** logic count **24** (< 25) · raw ≥300: **33**

**P3 (2026-07-15) — פיצולים:**

| לפני | אחרי | פעולה |
|------|------|--------|
| 515 | 7 | `blueprint-excel-builders.ts` → barrel; `blueprint-excel-core.ts`, `blueprint-excel-boq-sheet.ts`, `blueprint-excel-extra-sheets.ts` |
| 536 | 3 | `mail-campaigns.ts` → barrel; `lib/mail/campaigns-{auth,invites,admin}.ts` |
| 445 | 3 | `scan-schema-v5.ts` → barrel; `scan-schema-v5-types.ts`, `scan-schema-v5-instructions.ts` |
| 447 | ~230+ | `ai-extract-docai.ts` + `docai-processor-config.ts` |
| 447 | ~150+ | `window-layout-policy.ts` → `window-layout-viewport.ts`, `window-layout-widgets.ts` |
| 427 | ~250+ | `google-calendar-sync.ts` + `google-calendar-sync-helpers.ts` |
| 436 | 350+88 | `blueprint-analyze.ts` + `blueprint-analyze-merge.ts` |
| 323 | ~245 | `useScanQueue.ts` + `useScanQueueNavigation.ts` |
| 309 | ~165 | `useScanQueueExecution.ts` + `runScanQueueBatch.ts` |
| 317 | ~200 | `tri-engine-extract-sequential.ts` + `tri-engine-extract-invoice-sequential.ts` |

**bulk OK (מוחרג מ-logic count):** `lib/help-center/content.*.ts`, `lib/i18n/keys.ts`, `lib/construction-trades-patches.ts`, `lib/pdf/product-brochure-v2-styles.ts`, `lib/pdf/brochure-styles/*`, `lib/pdf/product-brochure-html.ts`, `lib/pdf/marketing-onepager-html.ts`, `lib/pdf/system-specification-html.ts`, `lib/pdf/invoice-print-html.ts`.

**logic ≥300 שנותרו (24):**

| שורות | קובץ | שלב מוצע |
|------|------|----------|
| 471 | `components/.../useCrmTable.ts` | mutations / fetch |
| 430 | `lib/launcher/user-launcher-config.ts` | slots module |
| 400 | `components/.../useAppBuilder.ts` | parts |
| 392 | `lib/launcher/quick-grid.ts` | layout |
| 371 | `lib/os-automations/registry.ts` | registry split |
| 350 | `lib/projects/blueprint-analyze.ts` | instruction extract |
| 346 | `lib/tri-engine-api-common.ts` | `lib/scan/` |

---

**P2 (2026-07-15):** `useScanQueue`, `tri-engine-extract`, `product-brochure-v2-styles`, `blueprint-excel`, `launcher-icons` — ראה היסטוריית P2 בקומיטים קודמים.

**P0:** TakeoffModule, ProjectBoqPanel, BlueprintPreviewModal, ProjectBoardWidget, OmniCanvasWorkspace — הושלם 2026-07-05.
