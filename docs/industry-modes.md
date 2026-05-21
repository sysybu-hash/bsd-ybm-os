# ענפים (Industry modes)

המערכת תומכת במספר ענפים דרך `Organization.industry` (Prisma) ו-`constructionTrade` כהתמחות משנה.

## ענפים נתמכים

| מזהה | תיאור |
|------|--------|
| `CONSTRUCTION` | קבלנות ובנייה (ברירת מחדל היסטורית) |
| `COMPANY_MGMT` | ניהול עסק / משרד / חברה |
| `GENERAL` | כללי (fallback) |

Aliases בנרמול: `BUSINESS`, `COMPANY_MANAGEMENT` → `COMPANY_MGMT`.

## שדה `constructionTrade`

נשמר ב-DB לשני הענפים:

- **בנייה:** ערכי `lib/construction-trades.ts` (למשל `GENERAL_CONTRACTOR`).
- **עסק:** ערכי `lib/business-lines.ts` (למשל `GENERAL_BUSINESS`).

שינוי שם השדה ב-Prisma (`industrySpecialization`) — אופציונלי בעתיד; כרגע תיעוד בלבד.

## הרשמה

- `POST /api/register` — `industry` מה-body; ברירת מחדל מ-`getDefaultIndustryForRegistration()`.
- `RegisterWizard` — בחירת ענף + התמחות.

## Session

`lib/auth.ts` — `organizationIndustry` ו-`constructionTrade` ב-JWT לפי הארגון.

## מדריך מפורט לעסק

[`company-management-mode.md`](./company-management-mode.md)
