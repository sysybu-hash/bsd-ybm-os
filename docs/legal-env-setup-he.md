# הגדרת משתני סביבה משפטיים (GDPR / שקיפות)

המערכת מציגה פרטי מפעיל בדפים `/privacy`, `/terms`, `/legal` דרך `lib/legal-site.ts`.

## חובה בפרודקשן (Vercel → Production)

| משתנה | תיאור |
|--------|--------|
| `NEXT_PUBLIC_LEGAL_REGISTERED_ADDRESS` | **כתובת רשומה אמיתית** — משרדים / מיקום מפעיל. אל תמציאו כתובת; Google OAuth verification עלול לדחות placeholder. |
| `NEXT_PUBLIC_LEGAL_ENTITY_NAME` | שם מפעיל או חברה (אופציונלי — ברירת מחדל בקוד קיימת) |
| `NEXT_PUBLIC_LEGAL_ENTITY_ID` | ח.פ. / עוסק מורשה (אופציונלי) |
| `NEXT_PUBLIC_LEGAL_CONTACT_EMAIL` | אימייל לפניות GDPR (ברירת מחדל: `yb@bsd-ybm.co.il`) |
| `NEXT_PUBLIC_EU_REPRESENTATIVE` | נציג באיחוד — אם לא חל, ציינו `לא חל` לאחר ייעוץ |

## איך למלא

1. העתיקו את השורות ל-`.env.local` לבדיקה מקומית, או הוסיפו ב-Vercel Dashboard → Settings → Environment Variables.
2. דוגמה (החליפו בערכים שלכם):

```env
NEXT_PUBLIC_LEGAL_REGISTERED_ADDRESS=רחוב ..., עיר ..., מיקוד ...
NEXT_PUBLIC_LEGAL_ENTITY_NAME=...
NEXT_PUBLIC_LEGAL_ENTITY_ID=...
NEXT_PUBLIC_LEGAL_CONTACT_EMAIL=yb@bsd-ybm.co.il
```

3. פרסמו מחדש (Redeploy) כדי שהערכים יופיעו בדפים הציבוריים.

## קישור ל-OAuth

במסך Branding / Verification של Google מומלץ שכתובת המפעיל תתאים לטקסט ב-`/privacy` — לכן `NEXT_PUBLIC_LEGAL_REGISTERED_ADDRESS` חייב להיות אמיתי לפני שליחת האימות.
