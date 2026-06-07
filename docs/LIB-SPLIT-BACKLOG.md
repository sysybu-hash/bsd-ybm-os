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
