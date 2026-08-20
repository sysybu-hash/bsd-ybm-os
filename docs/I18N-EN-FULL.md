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

## התקדמות Phase 4 (יולי 2026)

**הושלם — יסודות:**

- מסכי ליבה: `DashboardWidget`, `ScanFullEditor`, `CrmContactsTable`, `DocumentPreview` — מחרוזות גלויות עבריות הוחלפו ב-`t()` / `tr()` + מפתחות EN/HE/RU.
- שגיאות API קריטיות: `lib/i18n/api-error.ts` — בחירת שפה מ-`Accept-Language` או `?locale=`; בשימוש ב-`issued-documents` (ITA) ו-`import/schedule` (MPP).
- CI הדרגתי: `check-hardcoded-hebrew.mjs` תומך בנתיבי יעד (ראו למטה); exit 0 עד ניקוי backlog.

**חוב נותר (דוגמאות):**

- `DocumentCreatorWidget` — טפסים, אמצעי תשלום, כותרת תצוגה מקדימה.
- נתוני API דאשבורד — שמות סטטוס הצעות מחיר (`ממתין` וכו') מהשרת.
- מאות קבצי `components/` / `app/` נוספים — הרץ סריקה מלאה.
- `lib/api-json.ts` — הודעות ברירת מחדל בעברית.
- `lib/mpp/convert-client.ts` — מחרוזות פנימיות (מתורגמות ב-route).

## סריקה

```bash
npm run audit:hebrew-hardcode
```

### סריקה ממוקדת (Phase 4)

```bash
# קובץ בודד
node scripts/check-hardcoded-hebrew.mjs components/os/DashboardWidget.tsx

# תיקיית וידג'ט
node scripts/check-hardcoded-hebrew.mjs components/os/widgets/crm-table

# מספר נתיבים
node scripts/check-hardcoded-hebrew.mjs components/os/DashboardWidget.tsx components/os/widgets/invoice/DocumentPreview.tsx
```

ללא ארגומנטים — סריקה מלאה של `components/` ו-`app/`.
