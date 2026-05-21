# רשימת בדיקות לפרסום Google OAuth ו-Search Console

## בוצע בקוד / בפרויקט

- [x] דומיין קנוני: `https://www.bsd-ybm.co.il` (`lib/site-url.ts`, `lib/legal-site.ts`, `lib/site-metadata.ts`)
- [x] הפרדת scopes: התחברות (`openid email profile`) מול Drive ב-reconnect בלבד
- [x] דפים ציבוריים: `/`, `/about`, `/privacy`, `/terms`, `/legal`, `/integrations/google`
- [x] `sitemap.xml` — כולל את כל הנתיבים לעיל (`app/sitemap.ts`)
- [x] מטא אימות: `SITE_VERIFICATION_GOOGLE` / `GOOGLE_SITE_VERIFICATION` (`lib/site-metadata.ts`)
- [x] קישורים במיילים משתמשים ב-`NEXT_PUBLIC_SITE_URL` (ברירת מחדל www)
- [x] סקריפטים: `vercel:env:push:auth`, `vercel:env:push:mail`, `scripts/test-email.mjs`
- [x] Runbook בעברית: `docs/google-oauth-verification-runbook-he.md`

## לפני שליחה לביקורת OAuth (Google Cloud Console) — ידני

1. **דומיין ייצור** — `NEXT_PUBLIC_SITE_URL`, `NEXTAUTH_URL`, `AUTH_URL` = `https://www.bsd-ybm.co.il` (Vercel).
2. **Redirect URIs** — ב-OAuth Client:
   - `https://www.bsd-ybm.co.il/api/auth/callback/google`
   - `https://www.bsd-ybm.co.il/api/auth/google-reconnect/callback`
   - `http://localhost:3000/api/auth/callback/google`
   - `http://localhost:3000/api/auth/google-reconnect/callback`
3. **JavaScript origins** — `https://www.bsd-ybm.co.il`, `http://localhost:3000`
4. **Scopes** — sign-in: `openid email profile`; Drive רק ב-reconnect.
5. **Branding** — home, privacy, terms, לוגו 120×120.
6. **כתובת רשומה** — `NEXT_PUBLIC_LEGAL_REGISTERED_ADDRESS` (אמיתית) — `docs/legal-env-setup-he.md`
7. **מייל** — `RESEND_API_KEY` (או SMTP) + אימות דומיין ב-Resend.

## Search Console (לאחר deploy) — ידני

- [ ] הוספת נכס (Domain או URL prefix)
- [ ] אימות מטא-תג — `SITE_VERIFICATION_GOOGLE` ב-Vercel → Redeploy
- [ ] שליחת sitemap: `https://www.bsd-ybm.co.il/sitemap.xml`
- [ ] URL Inspection ל-`/` ו-`/about`

## שליחת Verification + סרטון — ידני בלבד

- [ ] Submit for verification (scope Drive)
- [ ] סרטון YouTube Unlisted (סקריפט: `docs/google-oauth-verification-runbook-he.md`)
- [ ] Publish app אחרי אישור Google

## בדיקות פונקציונליות

- [ ] התחברות Google ללא `redirect_uri_mismatch`
- [ ] מייל בדיקה: `node scripts/test-email.mjs` או `/api/admin/test-email`
- [ ] הרשמה / `resend-verification` שולחים מייל כש-Resend מוגדר
- [ ] באנר עוגיות; `hreflang` he/en/ru

## משתני סביבה (ראו `.env.example`)

| משתנה | תיאור |
|--------|--------|
| `NEXT_PUBLIC_SITE_URL` | `https://www.bsd-ybm.co.il` |
| `NEXTAUTH_URL` / `AUTH_URL` | אותו host |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth (לא ב-Git) |
| `RESEND_API_KEY` | דואר (או SMTP) |
| `SITE_VERIFICATION_GOOGLE` | Search Console |
| `NEXT_PUBLIC_LEGAL_REGISTERED_ADDRESS` | כתובת אמיתית |

### סטטוס ENV (בדיקה אוטומטית — מאי 2026)

**Vercel Production** (`vercel env ls production`):

- [x] `DATABASE_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- [x] `NEXTAUTH_URL`, `AUTH_URL`, `NEXT_PUBLIC_SITE_URL` — עודכנו ל-`https://www.bsd-ybm.co.il` (`npm run vercel:env:push:auth`)
- [x] `MAIL_FROM`, `MAIL_REPLY_TO`, `OS_ADMIN_EMAILS` (`npm run vercel:env:push:mail`)
- [ ] `RESEND_API_KEY` — **לא** ברשימת Production (מיילים לא יישלחו עד הוספה ב-Vercel או `.env.local` + push)
- [ ] `SITE_VERIFICATION_GOOGLE` — לא ב-Production
- [ ] `NEXT_PUBLIC_LEGAL_REGISTERED_ADDRESS` — לא ב-Production

**מקומי** (`.env.local` / `.env`):

- [x] `DATABASE_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (פיתוח: `localhost` ב-URL)
- [ ] `RESEND_API_KEY` / SMTP — חסר; `npm run test:email` נכשל
- [ ] `NEXT_PUBLIC_LEGAL_REGISTERED_ADDRESS`, `SITE_VERIFICATION_GOOGLE` — חסר

**הערה:** `.env.vercel.pull` ישן (non-www) — לא מקור אמת; הריצו `vercel env pull` אחרי עדכון.

מדריכים: **`docs/google-oauth-verification-guide.md`** · **`docs/google-oauth-verification-runbook-he.md`**
