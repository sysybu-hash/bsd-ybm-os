# מוצר אנגלי מלא — מסלול 10/10

## סטטוס מפתחות

```bash
node scripts/i18n-key-parity.mjs
```

יעד: ≥98% — **נוכחי: 100%** (918 מפתחות en/ru מול he).

## צ'קליסט UX אנגלי

- [ ] `?locale=en` על workspace — כל תוויות Hub/CRM/Finance באנגלית
- [ ] [help-center-i18n.spec.ts](../e2e/help-center-i18n.spec.ts) ירוק
- [ ] חשבוניות PDF/מייל — locale לפי `getServerLocale()`
- [ ] `node scripts/check-hardcoded-hebrew.mjs` — צמצום הפרות ב-`components/` (מעבר ל-t())

## סריקה

```bash
npm run audit:hebrew-hardcode
```
