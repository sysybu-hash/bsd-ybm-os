# מצב ניהול עסק / חברה (`COMPANY_MGMT`)

מדריך למנהלי מערכת ולארגונים שעובדים במצב **כפול** לצד ענף הבנייה (`CONSTRUCTION`).

## מה זה?

- **CONSTRUCTION** — CRM, ERP, פרויקטים עם BOQ, יומן שטח, Meckano (לפי מנוי), סריקות כתב כמויות.
- **COMPANY_MGMT** — אותם ליבות (CRM, ERP, מחולל מסמכים, לוח פרויקטים, גantt, משימות) **בלי** BOQ, יומן שטח בולט, ו-**Meckano מוסתר ב-launcher** גם אם המנוי פעיל.

## הגדרת ארגון

### מהאפליקציה (ORG_ADMIN)

הגדרות → **תחום העסק / מקצוע** (`ProfessionSettingsPanel`):

1. בחירת ענף: בנייה או ניהול עסק.
2. בחירת התמחות: trade בנייה או קו עסק (`GENERAL_BUSINESS`, `SERVICES`, …).

### ממסוף אדמין

```bash
node scripts/set-org-industry.mjs COMPANY_MGMT GENERAL_BUSINESS sysybu@gmail.com
```

אחרי שינוי ענף: **התנתקות והתחברות** לרענון `organizationIndustry` ב-JWT.

### ממסוף פלטפורמה

לשונית **מנויים** → בחירת ארגון → ענף + קו עסק/מקצוע → שמירה.

## מפת מודולים

| מודול | CONSTRUCTION | COMPANY_MGMT |
|--------|--------------|--------------|
| CRM / ERP | כן | כן |
| לוח פרויקטים + גantt | כן | כן (תת-תחומים עסקיים) |
| BOQ / כתב כמויות | כן | מוסתר + API 403 |
| יומן שטח / Meckano ב-launcher | לפי מנוי | מוסתר |
| סריקה AI | BOQ, יומן, חשבונית… | חשבונית + מסמך כללי |

## קבצי ליבה

- `lib/professions/config.ts` — `INDUSTRY_CONFIGS.COMPANY_MGMT`
- `lib/business-lines.ts` — התמחויות עסק
- `lib/launcher/launcher-permissions.ts` — gating לפי `organizationIndustry`
- `lib/project-sub-domains.ts`, `lib/project-document-catalog.ts`
- `lib/industry-api-guard.ts` — BOQ API

ראו גם: [`docs/industry-modes.md`](./industry-modes.md).
