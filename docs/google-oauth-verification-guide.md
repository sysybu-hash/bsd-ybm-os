# מדריך אימות Google OAuth לפרודקשן (BSD-YBM OS)

מסמך זה משלים את `google-oauth-publish-checklist.md` ומיועד לשליחת האפליקציה ל-**Verification** ב-Google Cloud Console (פרויקט `bsd-ybm-os`).

## 0. דומיין קנוני אחד (קריטי)

בקונסולה מופיעים `bsdybm.co.il` ו-`bsd-ybm-os.vercel.app`. בקוד ברירת המחדל היא **`https://www.bsd-ybm.co.il`** (עם מקף: `bsd-ybm`).

| פעולה | מה לעשות |
|--------|-----------|
| DNS | ודאו ש-`bsd-ybm.co.il` ו-`www.bsd-ybm.co.il` מפנים ל-Vercel (או הוסיפו redirect מ-`bsdybm.co.il` אם זו טעות) |
| Authorized domains | ב-Branding: רק דומיינים שבבעלותכם ותואמים ל-URL שתמלאו |
| Vercel env | `NEXT_PUBLIC_SITE_URL`, `NEXTAUTH_URL`, `AUTH_URL` — **אותו host** (מומלץ `https://www.bsd-ybm.co.il`) |

## 1. Branding (מסך שבצילום)

מלאו ושמרו:

| שדה | ערך מומלץ |
|-----|-----------|
| Application home page | `https://www.bsd-ybm.co.il` |
| Application privacy policy link | `https://www.bsd-ybm.co.il/privacy` |
| Application terms of service link | `https://www.bsd-ybm.co.il/terms` |
| App name | עקבי עם הקונסולה (למשל `bsd-ybm-os` או `BSD-YBM OS`) |
| User support email | `sysybu@gmail.com` (או `yb@bsd-ybm.co.il`) |
| Developer contact | אימייל פעיל לתכתובת Google |

**לוגו:** העלאה מפעילה דרישת **Verify branding** — השתמשו בלוגו 120×120 מהמותג; אחרי deploy ודאו שהדפים נטענים ב-HTTPS.

דף נוסף לביקורת (מומלץ לציין בטופס האימות):

- `https://www.bsd-ybm.co.il/integrations/google`

## 2. OAuth consent screen — Publishing status

1. **APIs & Services → OAuth consent screen**
2. User type: **External** (משתמשים מחוץ לארגון Google Workspace שלכם)
3. Scopes: ודאו שמופיעים לפחות:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `openid`
   - `https://www.googleapis.com/auth/drive` (**Restricted** — דורש אימות)
4. **Test users** — לפיתוח בלבד; לפרודקשן צריך **Publish app** אחרי אישור.

## 3. OAuth Client (Credentials)

Redirect URIs (ייצור) — **חובה גם reconnect**:

```
https://www.bsd-ybm.co.il/api/auth/callback/google
https://www.bsd-ybm.co.il/api/auth/google-reconnect/callback
```

(אופציונלי — אם יש redirect מ-www: `https://bsd-ybm.co.il/...` עם אותם שני נתיבים. ה-host חייב להתאים בדיוק ל-`NEXTAUTH_URL`.)

פיתוח:

```
http://localhost:3000/api/auth/callback/google
http://localhost:3000/api/auth/google-reconnect/callback
```

**התחברות (sign-in):** scopes `openid`, `email`, `profile` בלבד — ראו `lib/auth.ts`.  
**Google Drive (Restricted):** scope `https://www.googleapis.com/auth/drive` רק ב-`/api/auth/google-reconnect` — ראו `lib/google-account-tokens.ts`.

## 4. שליחת Verification (Restricted scope: Drive)

נתיב: **OAuth consent screen → Submit for verification** (או Data Access / Verification center).

### טקסט מוכן — מטרת השימוש ב-Drive (העתקה לאנגלית בטופס Google)

```
BSD-YBM OS is a B2B operations platform for construction businesses in Israel.
We request https://www.googleapis.com/auth/drive so authenticated users can:
(1) Connect their Google Drive to sync a dedicated workspace folder (e.g. BSD-YBM),
(2) List and open files in that folder inside our UI,
(3) Upload invoices and documents from Drive into our ERP archive,
(4) Run optional AI-assisted decoding of selected documents into structured ERP data.
We do not use Drive data for advertising. Users can disconnect in app settings or revoke at https://myaccount.google.com/permissions.
Privacy: https://www.bsd-ybm.co.il/privacy
Google integration details: https://www.bsd-ybm.co.il/integrations/google
```

### סרטון הדגמה (לעיתים נדרש)

הקליטו 2–5 דקות:

1. פתיחת `https://www.bsd-ybm.co.il/login`
2. Sign in with Google → מסך הסכמה (הצגת scope כולל Drive)
3. כניסה למערכת → וידג'ט Google Drive
4. הצגת רשימת קבצים / סנכרון / פענוח מסמך אחד (ללא מידע רגיש אמיתי — נתוני דמו)
5. הגדרות → ניתוק / הסבר על ביטול ב-`myaccount.google.com/permissions`

העלו ל-YouTube (**Unlisted**) ושימו את הקישור בטופס.

### מסמכים נוספים ש-Google עלולים לבקש

- הסבר מדוע לא `drive.file` (סנכרון תיקייה קיימת)
- דוגמת מסך מדיניות פרטיות עם סעיף Google Drive (כבר ב-`/privacy`)
- פרטי מפעיל: מלאו `NEXT_PUBLIC_LEGAL_REGISTERED_ADDRESS` ב-Vercel

## 5. משתני סביבה ב-Vercel (Production)

```env
NEXT_PUBLIC_SITE_URL=https://www.bsd-ybm.co.il
NEXTAUTH_URL=https://www.bsd-ybm.co.il
AUTH_URL=https://www.bsd-ybm.co.il
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_SECRET=...
NEXT_PUBLIC_LEGAL_REGISTERED_ADDRESS=...   # כתובת אמיתית — חובה לשקיפות
NEXT_PUBLIC_LEGAL_ENTITY_NAME=...
NEXT_PUBLIC_LEGAL_CONTACT_EMAIL=yb@bsd-ybm.co.il
```

אחרי deploy — בדיקה:

- [ ] `curl -I https://www.bsd-ybm.co.il/privacy` → 200
- [ ] `curl -I https://www.bsd-ybm.co.il/integrations/google` → 200
- [ ] התחברות Google ללא `redirect_uri_mismatch`
- [ ] אין מסך "Google hasn't verified this app" **אחרי** אישור + Publish

## 6. Search Console (מומלץ לפני/במקביל)

1. נכס: Domain `bsd-ybm.co.il` או URL prefix `https://www.bsd-ybm.co.il`
2. אימות: `SITE_VERIFICATION_GOOGLE` ב-Vercel
3. Sitemap: `https://www.bsd-ybm.co.il/sitemap.xml`

## 7. לוח זמנים צפוי

| שלב | זמן משוער |
|-----|-----------|
| מילוי Branding + deploy דפים | יום 1 |
| Submit verification (Drive scope) | יום 1 |
| ביקורת Google | כמה ימים עד **מספר שבועות** |
| תיקונים / שאלות נוספות | לפי דרישה |

בינתיים לבדיקות מוגבלות: השאירו **Testing** והוסיפו Test users.

## 8. Runbook בעברית (צעד-אחר-צעד)

לצוות שמבצע את הפעולות בקונסולה: **`docs/google-oauth-verification-runbook-he.md`** (כולל סקריפט לסרטון 2–5 דקות).

## 9. פתרון בעיות נפוצות

| בעיה | פתרון |
|------|--------|
| `redirect_uri_mismatch` | התאמת URI ב-Credentials ל-`NEXTAUTH_URL` |
| Branding לא נשלח | מלאו home + privacy + terms + לוגו |
| דומיין לא מאומת | הוסיפו TXT/CNAME ב-DNS לפי Google |
| `bsdybm` vs `bsd-ybm` | יישור דומיין אחד בכל המקומות |
| אימות נדחה ל-Drive | חזקו סרטון, קישור `/integrations/google`, הסבר scope מלא |

---

**אין בזה ייעוץ משפטי.** לאימות GDPR/ישראל — יועץ פרטיות.
