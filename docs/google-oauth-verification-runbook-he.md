# Runbook: אימות Google OAuth לפרודקשן (BSD-YBM OS)

מסמך צעד-אחר-צעד לביצוע ידני ב-Google Cloud Console + Vercel.  
מה שכבר מיושם בקוד מסומן כאן; השאר דורש פעולה שלכם.

## מה כבר מוכן בפרויקט

- [x] דומיין קנוני בקוד: `https://www.bsd-ybm.co.il` (`lib/site-url.ts`, `lib/legal-site.ts`)
- [x] התחברות Google: scopes `openid email profile` בלבד (`lib/auth.ts`, `prompt=select_account`)
- [x] תמיכה ב-Client נפרד לכניסה: `GOOGLE_SIGNIN_CLIENT_ID` / `GOOGLE_SIGNIN_CLIENT_SECRET` (`lib/google-oauth-env.ts`)
- [x] Google Drive: scope `drive` רק ב-`/api/auth/google-reconnect` (`lib/google-account-tokens.ts`)
- [x] Google Calendar: `calendar` רק ב-`/api/integrations/google/calendar/*` (אחרי אישור מנוי)
- [x] מדריך מרכזי: `docs/GOOGLE-OAUTH.md`
- [x] דפים ציבוריים: `/`, `/about`, `/privacy`, `/terms`, `/legal`, `/integrations/google`
- [x] `sitemap.xml` כולל את כל הדפים לעיל (`app/sitemap.ts`)
- [x] מטא אימות Search Console: `SITE_VERIFICATION_GOOGLE` / `GOOGLE_SITE_VERIFICATION` (`lib/site-metadata.ts`)
- [x] סקריפטים: `npm run vercel:env:push:auth`, `npm run vercel:env:push:mail`

## שלב 1 — Vercel (Production)

הגדירו (או הריצו `npm run vercel:env:push:auth` / `vercel:env:push:mail` עם `.env.local` מלא):

| משתנה | ערך | סטטוס Production |
|--------|-----|------------------|
| `NEXTAUTH_URL` | `https://www.bsd-ybm.co.il` | [x] עודכן (`vercel:env:push:auth`) |
| `AUTH_URL` | `https://www.bsd-ybm.co.il` | [x] עודכן |
| `NEXT_PUBLIC_SITE_URL` | `https://www.bsd-ybm.co.il` | [x] עודכן |
| `NEXTAUTH_SECRET` | סוד אקראי | [x] קיים ב-Vercel |
| `GOOGLE_CLIENT_ID` | מ-OAuth Client | [x] קיים ב-Vercel |
| `GOOGLE_CLIENT_SECRET` | מ-OAuth Client | [x] קיים ב-Vercel |
| `RESEND_API_KEY` | מ-Resend (או SMTP מלא) | [ ] **חסר** — הוסיפו ב-Vercel או ב-`.env.local` ואז `npm run vercel:env:push:mail` |
| `NEXT_PUBLIC_LEGAL_REGISTERED_ADDRESS` | כתובת אמיתית — `docs/legal-env-setup-he.md` | [ ] חסר |
| `SITE_VERIFICATION_GOOGLE` | ערך מ-Search Console | [ ] חסר |

אחרי deploy: `curl -I https://www.bsd-ybm.co.il/privacy` → 200.

## שלב 2 — Google Cloud Console

### 2.1 OAuth consent screen → Branding

| שדה | ערך |
|-----|-----|
| Application home page | `https://www.bsd-ybm.co.il` |
| Privacy policy | `https://www.bsd-ybm.co.il/privacy` |
| Terms of service | `https://www.bsd-ybm.co.il/terms` |
| User support email | `yb@bsd-ybm.co.il` או `sysybu@gmail.com` |

- [ ] העלאת לוגו 120×120 (מפעיל Verify branding)
- [ ] שמירה

### 2.1ב — מצב Testing (פתרון מיידי לאזהרה)

1. [OAuth consent screen → Audience](https://console.cloud.google.com/apis/credentials/consent)
2. **Publishing status:** **Testing** (לא In production)
3. **Test users** → הוסיפו `sysybu@gmail.com` וכל מייל לבדיקה
4. שמרו — משתמשים ברשימה לא יראו את דף «לא מאומתה» המלא

### 2.2 Credentials → OAuth 2.0 Client

**מומלץ:** שני Clients (ראו `docs/GOOGLE-OAUTH.md`). אחרת Client יחיד עם כל ה-URIs:

**Authorized redirect URIs** (הדביקו בדיוק):

```
https://www.bsd-ybm.co.il/api/auth/callback/google
https://www.bsd-ybm.co.il/api/auth/google-reconnect/callback
https://www.bsd-ybm.co.il/api/integrations/google/calendar/callback
http://localhost:3000/api/auth/callback/google
http://localhost:3000/api/auth/google-reconnect/callback
http://localhost:3000/api/integrations/google/calendar/callback
```

**Authorized JavaScript origins**:

```
https://www.bsd-ybm.co.il
http://localhost:3000
```

- [ ] שמירה
- [ ] בדיקת התחברות בפרודקשן ללא `redirect_uri_mismatch`

### 2.3 Scopes (Data access)

**Client Sign-in (אם נפרד):** רק `openid`, `email`, `profile`.

**Client אינטגרציות (או Client יחיד):**

- `openid`, `email`, `profile`
- `https://www.googleapis.com/auth/drive` — **Restricted** (reconnect בלבד)
- `https://www.googleapis.com/auth/calendar` — **Sensitive** (סנכרון יומן opt-in בלבד)

### 2.4 Submit for verification (Drive)

- [ ] מילוי טופס באנגלית (טקסט מוכן: `docs/google-oauth-verification-guide.md` §4)
- [ ] קישור לסרטון YouTube **Unlisted** (סקריפט למטה)
- [ ] שליחה — **לא ניתן לבצע ע"י סוכן AI**

לאחר אישור:

- [ ] **Publish app** (מעבר מ-Testing ל-In production)

## שלב 3 — סרטון הדגמה (2–5 דקות)

הקליטו מסך (עברית או אנגלית) לפי הסדר:

1. **פתיחה:** `https://www.bsd-ybm.co.il/login` — הצגת דף נחיתה/כניסה.
2. **התחברות:** "Sign in with Google" → מסך הסכמה (הדגישו email/profile; אם מופיע Drive — רק אחרי reconnect).
3. **מערכת:** כניסה ל-workspace, פתיחת וידג'ט Google Drive (רשימת קבצים / תיקייה).
4. **פעולה אחת:** העלאה או פתיחת מסמך דמו (ללא מידע רגיש אמיתי).
5. **פרטיות:** `/integrations/google` ו-`/privacy` — הסבר ניתוק ב-`https://myaccount.google.com/permissions`.

העלו ל-YouTube כ-**Unlisted**, הדביקו בטופס Google.

## שלב 4 — Search Console

1. [ ] נכס: Domain `bsd-ybm.co.il` או URL prefix `https://www.bsd-ybm.co.il`
2. [ ] אימות HTML tag → העתיקו ל-`SITE_VERIFICATION_GOOGLE` ב-Vercel → Redeploy
3. [ ] Sitemap: `https://www.bsd-ybm.co.il/sitemap.xml`
4. [ ] URL Inspection ל-`/` ו-`/about`

## שלב 5 — בדיקת מייל

| סביבה | פקודה / פעולה |
|--------|----------------|
| מקומי | `node scripts/test-email.mjs your@email.com` (דורש `RESEND_API_KEY` ב-`.env.local`) |
| פרודקשן | מסוף סופר-אדמין → כפתור "בדיקת מייל" → `POST /api/admin/test-email` |

## מה לא ניתן לבצע אוטומטית

- כניסה ל-Google Cloud Console ולחיצת Submit / Publish
- הקלטת והעלאת סרטון YouTube
- מילוי כתובת רשומה אמיתית בלי שתספקו אותה (`docs/legal-env-setup-he.md`)

---

מדריך מפורט באנגלית לטופס Google: `docs/google-oauth-verification-guide.md`  
רשימת בדיקות: `docs/google-oauth-publish-checklist.md`
