# רשימת בדיקות לפרסום Google OAuth ו-Search Console

## לפני שליחה לביקורת OAuth (Google Cloud Console)

1. **דומיין ייצור** — `NEXT_PUBLIC_SITE_URL`, `NEXTAUTH_URL`, `AUTH_URL` מצביעים לאותו host (למשל `https://www.bsd-ybm.co.il`).
2. **Redirect URIs** — ב-OAuth Client:
   - `https://<domain>/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google` (פיתוח בלבד)
3. **דפים ציבוריים** (ללא התחברות):
   - `/` — נחיתה
   - `/about` — אודות
   - `/privacy` — מדיניות פרטיות
   - `/terms` — תנאי שימוש
   - `/legal` — מדיניות עוגיות / משפטי
4. **מטא אימות** — לאחר deploy, הדביקו ב-Vercel:
   - `SITE_VERIFICATION_GOOGLE` או `GOOGLE_SITE_VERIFICATION` (ערך מתוך Search Console)
5. **סitemap** — `https://<domain>/sitemap.xml` נגיש; `robots.txt` מפנה אליו.
6. **לוגו ומיתוג** — אייקון 192/512 ב-`manifest.json`, `og-image.png` בפרודקשן.
7. **מדיניות OAuth** — בקונסולת Google: קישור ל-`/privacy`, שם אפליקציה עקבי עם `applicationName` ב-metadata.

## Search Console (לאחר deploy)

1. הוסיפו נכס (Domain או URL prefix).
2. אימות דרך מטא-תג — משתנה `SITE_VERIFICATION_GOOGLE`.
3. שלחו sitemap: `/sitemap.xml`.
4. בדקו דף בית ו-`/about` ב-URL Inspection.

## בדיקות פונקציונליות

- [ ] התחברות Google מסתיימת ב-callback ללא שגיאת `redirect_uri_mismatch`
- [ ] באנר עוגיות מופיע בביקור ראשון; שמירה ב-localStorage
- [ ] `hreflang` / locale cookie — מעבר he/en/ru
- [ ] סורק AI — `/api/scan/engine-meta` ו-`/api/scan/tri-engine/stream` למשתמש מחובר

## משתני סביבה (ראו `.env.example`)

| משתנה | תיאור |
|--------|--------|
| `NEXT_PUBLIC_SITE_URL` | URL קנוני |
| `SITE_VERIFICATION_GOOGLE` | אימות Search Console |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth |
