# תוכנית QA — BSD-YBM OS

> גרסה 1.0 | 2026-05-24

## מטריצת סביבות

| סוג | דפדפנים | שפות |
|-----|---------|------|
| רגרסיה לפני release | Chrome latest, Firefox latest, Safari (macOS) | he (RTL), en (LTR), ru (LTR) |
| smoke יומי | Chrome | he |
| מובייל | Chrome Android, Safari iOS | he |

## תפקידים

| תפקיד | בדיקות חובה |
|--------|-------------|
| ORG_ADMIN | Hub, launcher עריכה, field-copilot, הגדרות |
| Member | Hub read-only לפי הרשאות, CRM, פרויקטים |

## אוטומציה

```bash
npm run test:e2e:workspace   # hubs, launcher, field-copilot, a11y
npm run test                 # Jest unit
node scripts/i18n-key-parity.mjs
node scripts/load-test.mjs   # BASE_URL=...
```

Playwright מפעיל אוטומטית `next dev` על פורט **3001** (מקומי). אם `npm run dev` כבר רץ על 3000 — אין צורך; Playwright ישתמש בשרת 3001 או ב-`reuseExistingServer` אם ה-URL תואם. ל-production-like: `PLAYWRIGHT_WEB_COMMAND="npm run build && npx next start -p 3001" npm run test:e2e:workspace`.

## 5 מסעות ליבה (ידני — FIX-PLAN §12.4)

1. התחברות (credentials / passkey) → workspace נטען.
2. פתיחת **פיננסים** מ-quick grid → טאבים overview / cashflow.
3. **מסמכים** → סריקה או ארכיון.
4. **Google Drive** מסרגל צד.
5. **קופיילוט שטח** — יצירת סשן ללא שגיאה (אחרי `npm run db:migrate`).

## חומרת באגים

| רמה | הגדרה | SLA |
|-----|--------|-----|
| P0 | לא ניתן להתחבר / אובדן נתונים | תיקון מיידי |
| P1 | מסלול ליבה שבור | 48h |
| P2 | UX / i18n חסר | sprint |

## שער release

- [ ] `npm run premerge` ירוק
- [ ] E2E workspace + auth-api-smoke
- [ ] parity i18n ≥98% (`i18n-key-parity.mjs`)
- [ ] 0 Critical/Serious axe ב-workspace shell
