# Security Audit Baseline

> עודכן: 2026-05-31. מתעד את הפגיעויות הידועות שנותרו ב-`npm audit` ואת ההחלטה לגביהן.
> לבדיקה: `npm audit`. ה-baseline המקובל כרגע: **19 (2 low, 16 moderate, 1 high)** — כולן transitive.

## רקע

- **`xlsx` (SheetJS)** — היו 2 high (Prototype Pollution + ReDoS) ללא תיקון ב-npm.
  **טופל**: הוחלף ל-`exceljs` 4.4.0. ראו commit `security: replace xlsx with exceljs`.
- `npm audit fix` (ללא `--force`) הורץ — סגר את כל מה שניתן בלי שינוי שובר.

## פגיעויות שנותרו — סיכון מקובל

כל הפגיעויות שנותרו הן **transitive** (תלויות-משנה), והתיקון דורש `npm audit fix --force`
שמבצע major-bump שובר על תלות-אב. הוחלט **לא** לבצע force; כל מעבר major ייבחן בנפרד
(ראו `docs/ONBOARDING.md` — מעברי major נדחים לתוכנית ייעודית).

| חבילה | חומרה | מגיע דרך | למה הסיכון מקובל |
|-------|-------|----------|------------------|
| `tmp` | high | `@lhci/cli` (Lighthouse CI, dev) | ניצול דורש שליטת תוקף בפרמטר `dir`/prefix של temp — לא נחשף ע"י קוד האפליקציה. dev-tool בלבד. |
| `uuid` (<11.1.1) | moderate | `google-gax` / `gaxios` (Google SDK) | bounds-check חסר רק כש-`buf` מסופק ל-v3/v5/v6 — לא דפוס השימוש שלנו. |
| `postcss` (<8.5.10) | moderate | bundled ב-`next` | build-time בלבד; ייסגר בעדכון Next. |
| `nodemailer` (<=8.0.4) | moderate | ישיר (שליחת מייל) | לבדוק בעדכון minor עתידי; אין fix לא-שובר זמין כרגע. |

## מתי לחזור לבדוק

- בעדכון major של Prisma / `@google/genai` / Next — להריץ `npm audit` מחדש ולעדכן טבלה זו.
- אם מופיעה פגיעות **high/critical ב-runtime** (לא dev/transitive) — לטפל מיידית.
