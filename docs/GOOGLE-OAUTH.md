# Google OAuth — BSD-YBM OS

מדריך מרכזי לכניסה עם Google, אזהרת «אפליקציה לא מאומתת», ואימות לפרודקשן.

---

## למה מופיעה האזהרה הצהובה?

Google מציגה **«Google לא אימתה את האפליקציה»** / **«כניסה (לא מאובטח)»** כאשר מתקיים אחד או יותר מהבאים:

| סיבה | הסבר |
|------|------|
| **אפליקציה חיצונית (External) בפרודקשן** | ב-OAuth consent screen המצב הוא **In production** בלי **App verification** מלאה. |
| **Scopes רגישים** | למשל `https://www.googleapis.com/auth/calendar` (Sensitive). `drive.file` הוא non-sensitive; אם רשום באותו Client עם scopes רגישים — עדיין עשויה להופיע אזהרה עד Publish. |
| **יותר מ־100 משתמשים** | ב-Testing mode רק Test users רשומים יכולים להתחבר בלי אזהרה; מעבר לכך נדרש Publish + אימות. |

**לא ניתן להסיר את האזהרה בקוד בלבד** לכלל המשתמשים בפרודקשן — רק Google (אימות + Publish) או מצב Testing עם משתמשי בדיקה.

---

## מה הקוד מבקש (scopes)

| זרימה | נתיב | Scopes |
|--------|------|--------|
| **התחברות (NextAuth)** | `/api/auth/callback/google` | `openid`, `email`, `profile` בלבד |
| **Google Drive** | `/api/auth/google-reconnect` | + `https://www.googleapis.com/auth/drive.file` |
| **Google Calendar** | `/api/integrations/google/calendar/connect` | + `https://www.googleapis.com/auth/calendar` (רק אחרי אישור מפורש בהגדרות) |

קבצי מפתח: `lib/auth.ts`, `lib/google-account-tokens.ts`, `lib/google-calendar-config.ts`, `lib/google-calendar-oauth.ts`.

API אחרים (Gemini, Document AI) משתמשים במפתחות שרת — **לא** ב-OAuth המשתמש.

---

## פיצול שני OAuth Clients (מומלץ)

כדי ש**מסך הכניסה** לא יציג scopes של Drive/Calendar:

1. ב-[Google Cloud Console](https://console.cloud.google.com/apis/credentials) צרו **שני** OAuth 2.0 Client IDs:

### Client A — Sign-in בלבד

- **שם:** `BSD-YBM Sign-In`
- **Scopes ב-Data access:** רק `openid`, `email`, `profile` (ללא Drive/Calendar)
- **Redirect URIs:**
  - `https://www.bsd-ybm.co.il/api/auth/callback/google`
  - `http://localhost:3000/api/auth/callback/google`
- **ב-Vercel / `.env.local`:**
  - `GOOGLE_SIGNIN_CLIENT_ID`
  - `GOOGLE_SIGNIN_CLIENT_SECRET`

### Client B — אינטגרציות

- **שם:** `BSD-YBM Integrations`
- **Scopes:** `openid`, `email`, `profile`, `drive.file`, `calendar` (לפי הצורך)
- **Redirect URIs:**
  - `https://www.bsd-ybm.co.il/api/auth/google-reconnect/callback`
  - `https://www.bsd-ybm.co.il/api/integrations/google/calendar/callback`
  - `http://localhost:3000/api/auth/google-reconnect/callback`
  - `http://localhost:3000/api/integrations/google/calendar/callback`
- **ב-Vercel / `.env.local`:**
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`

אם **לא** מגדירים `GOOGLE_SIGNIN_*` — המערכת משתמשת ב-`GOOGLE_CLIENT_ID` גם לכניסה (התנהגות ישנה).

---

## פתרון מיידי — מצב Testing + Test users

עד סיום אימות Google:

1. פתחו [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent).
2. **User type:** External.
3. **Publishing status:** **Testing** (לא In production).
4. **Test users** → הוסיפו לפחות:
   - `sysybu@gmail.com`
   - כל מייל שצריך לבדוק עכשיו
5. שמרו.

משתמשים **ברשימת Test users** יראו מסך הסכמה **בלי** דף האזהרה המלא (או עם אזהרה מינימלית).

> אחרי **Publish app** ללא אימות — האזהרה חוזרת לכל המשתמשים מחוץ לרשימה.

---

## מסך הסכמה (Branding) — חובה לאימות

ב-[OAuth consent screen → Branding](https://console.cloud.google.com/apis/credentials/consent/edit):

| שדה | ערך מומלץ |
|-----|-----------|
| App name | `bsd-ybm` / `BSD-YBM Intelligence` |
| User support email | `yb@bsd-ybm.co.il` |
| App logo | 120×120 |
| Application home page | `https://www.bsd-ybm.co.il` |
| Privacy policy | `https://www.bsd-ybm.co.il/privacy` |
| Terms of service | `https://www.bsd-ybm.co.il/terms` |

**Authorized domains:** `bsd-ybm.co.il` (ללא `www` — Google מוסיף תת-דומיינים).

דפים באתר: `/privacy`, `/terms`, `/integrations/google` (שקיפות scopes).

---

## אימות (Verification) לפרודקשן — Drive

Scope `https://www.googleapis.com/auth/drive` הוא **Restricted** — נדרש:

1. מילוי [Verification Center](https://console.cloud.google.com/apis/credentials/consent/verification) (באנגלית).
2. סרטון הדגמה (YouTube Unlisted) — ראו `docs/google-oauth-verification-runbook-he.md`.
3. המתנה (ימים–שבועות).
4. לאחר אישור: **Publish app** → In production.

`https://www.googleapis.com/auth/calendar` — **Sensitive**; ייתכן טופס נפרד או אותו תהליך.

מדריך מפורט: `docs/google-oauth-verification-guide.md`, רשימת בדיקות: `docs/google-oauth-publish-checklist.md`.

---

## Redirect URIs — רשימה מלאה לפרודקשן

```
https://www.bsd-ybm.co.il/api/auth/callback/google
https://www.bsd-ybm.co.il/api/auth/google-reconnect/callback
https://www.bsd-ybm.co.il/api/integrations/google/calendar/callback
```

**JavaScript origins:**

```
https://www.bsd-ybm.co.il
http://localhost:3000
```

---

## מה לא ניתן לתקן בלי Google

- הסרת «לא מאובטח» / «לא אומתה» לכלל הגולשים בפרודקשן.
- שימוש ב-Drive/Contacts ללא אימות scopes רגישים (מדיניות Google).
- האצת תהליך האימות — תלוי בצוות Google.

---

## קישורים מהירים

| משימה | קישור |
|--------|--------|
| Credentials | https://console.cloud.google.com/apis/credentials |
| OAuth consent screen | https://console.cloud.google.com/apis/credentials/consent |
| Test users | https://console.cloud.google.com/apis/credentials/consent → Audience |
| Verification | https://console.cloud.google.com/apis/credentials/consent/verification |
| ביטול הרשאות (משתמש) | https://myaccount.google.com/permissions |

---

## Runbook בעברית (צעדים ידניים)

`docs/google-oauth-verification-runbook-he.md`
