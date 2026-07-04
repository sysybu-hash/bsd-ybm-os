# Backlog — קבצים ≥300 שורות

עדכון: 2026-06-04 — `npm run lib:line-count`

**P0 הושלם:** `lib/pdf/product-brochure-v2-html.ts` → `product-brochure-v2-data.ts` + `product-brochure-v2-assets.ts` + `product-brochure-v2-styles.ts` + `product-brochure-v2-sections.ts` (224 שורות builder).

**P1 (2026-06-07):** `tri-engine-types`, `tri-engine-parse`, `tri-engine-extract-validated`, `tri-engine-extract-providers`, `tri-engine-extract-helpers`, `user-launcher-config.layout`.

| שורות | קובץ | שלב מוצע |
|------|------|----------|
| 883 | `lib/pdf/product-brochure-v2-styles.ts` | CSS bulk — OK |
| 548 | `lib/tri-engine-extract.ts` | invoice path → `tri-engine-extract-invoice.ts` |
| 548 | `lib/launcher/user-launcher-config.ts` | פיצול modules |
| 512 | `lib/mail.ts` | `lib/mail/` |
| 511 | `lib/tri-engine-extract.ts` | `lib/scan/` |
| 465 | `lib/launcher/launcher-icons.ts` | registry נפרד |
| 443 | `lib/ai-extract-docai.ts` | `lib/google/` |
| 438 | `lib/i18n/keys.ts` | generated / OK |
| 426 | `components/.../ClientProjectStep.tsx` | parts |
| 425–410 | `lib/help-center/content.*.ts` | locale bulk OK |
| 422 | `lib/tri-engine-api-common.ts` | `lib/scan/` |
| 415 | `lib/auth.ts` | `lib/auth/` |
| 404 | `lib/workspace/window-layout-policy.ts` | workspace |

יעד: אף קובץ לוגיקה >300 (מלבד locale keys ו-generated).

---

**P0 מעודכן (2026-07-05):** בוצעו פיצולי הקומפוננטות: TakeoffModule (581→58),
ProjectBoqPanel (544→204 + דה-דופליקציה של טבלה כפולה), BlueprintPreviewModal
(486→118), ProjectBoardWidget (380→278), OmniCanvasWorkspace (345→261).

**נדחו במכוון — לפצל רק אחרי כיסוי בדיקות (הסקאנר הוא מוקד באגים פעיל, תוקן 03/07):**

| קובץ | שורות | תכנון פיצול |
|------|------|-------------|
| `components/os/widgets/ai-scanner/useScanQueue.ts` | 596 | `useScanExecution` (runFileQueue/startScan/stop) + `useScanSave` (executeUnifiedSave/saveToNotebook/corrections) + `useScanPreview`. תנאי מקדים: בדיקות offline-outbox (Phase 11) שמכסות את זרימת התור |
| `lib/tri-engine-extract.ts` | 667 | פונקציה אחת ענקית `runTriEngineExtraction` — לחלץ בלוקי-מנוע (docai/gemini/openai/mistral/anthropic) לרשומת runners אחידה. תנאי מקדים: בדיקת אינטגרציה על מיזוג ריבוי-מנועים |
| `components/os/layout/MobileBottomNav.tsx` | 335 | חסום — שינויים לא-שמורים בעץ העבודה של המשתמש |
