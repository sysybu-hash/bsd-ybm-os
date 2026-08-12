# סגירת הקשחה — מדריך מפורט לבעלים

מדריך צעד־אחר־צעד להשלמת שערי ההקשחה אחרי שהקוד כבר ב־repo.  
**אל תדביקו מחרוזות חיבור מלאות** לצ׳אט / טיקטים — רק שם host / שם DB.

מסמכים קשורים:

- [VERCEL-ENV-CHECKLIST.md](../VERCEL-ENV-CHECKLIST.md)
- [RUNBOOK.md](../RUNBOOK.md)
- [csp-production-checklist.md](../csp-production-checklist.md)

---

## סיכום סטטוס

| # | שער | סטטוס | מי מבצע |
|---|-----|--------|---------|
| 0 | מיגרציית `IssuedDocumentSequence` | בוצע בפרוד | סוכן |
| 1 | בידוד DB של Preview | **חסום** — אין `PREVIEW_*` מקומי; `vercel env pull --environment preview` מחזיר DATABASE/DIRECT **unset** (ערכי Preview קיימים רק על ענף `feat/cursor-13-tasks`) | אתה (Neon branch `preview` + Vercel Preview env כללי) |
| 2 | `OS_ADMIN_EMAILS` | קיים ב־Production (+ `OS_ADMIN_EMAIL`); חסר ב־Preview הכללי | סוכן בדק ב־CLI; אתה מאשר כניסת אדמין בדפדפן |
| 3 | Redirect לחיבור Google | ממתין ל־Cloud Console | אתה |
| 4 | CSP_STRICT | `true` ב־Production+Preview; כותרת חיה ב־www **בלי** `unsafe-eval` | סוכן אימת כותרת; smoke תרחישים מלא בדפדפן אצלך |

**אימות סוכן (2026-08-12):** `npm run ops:verify-preview-db` → WARN Preview unset; CSP header OK; Vercel Production env שמות קריטיים קיימים.

סדר מומלץ לשאר: **1 → 3 → smoke מלא בדפדפן**.

### מה הסוכן כבר ביצע (עם אישורך)

- מיגרציית `IssuedDocumentSequence` על DB הפרוד (`migrate deploy` + status up to date)
- אימות ב־Vercel CLI: `OS_ADMIN_EMAILS` קיים ב־**Production**; `CSP_STRICT=true` ב־**Production** וב־**Preview**; `NEXTAUTH_URL=https://www.bsd-ybm.co.il`
- בדיקת כותרת CSP חיה ב־`https://www.bsd-ybm.co.il` — הכותרת קיימת, **בלי** `unsafe-eval` (מצביע על CSP_STRICT פעיל)
- הפעלת **People API** (`people.googleapis.com`) בפרויקטים `bsd-ybm` ו־`bsd-ybm-os` (לייבוא אנשי קשר)

### מה הסוכן לא יכול לבצע בלי גישה נוספת

| משימה | למה חסום | מה צריך ממך |
|--------|-----------|-------------|
| יצירת סניף Neon `preview` + עדכון Preview DB | אין `NEON_API_KEY` / `neonctl` | Neon Console, או מפתח API ב־`.env.local` |
| אימות ש־Preview DB ≠ פרוד | `vercel env pull` מחזיר ערכים רגישים ריקים | השוואת host ב־Vercel UI (Preview vs Production) |
| הוספת redirect URI ב־Google | אין API יציב ל־OAuth Client הקלאסי מ־CLI | הוספה ידנית ב־Cloud Console (סעיף 3) |
| Smoke מלא (PayPal / מיקרופון / App Builder) | דורש התחברות ופעולות בדפדפן | סעיף 4 — צ׳קליסט ידני |
| העתקת `OS_ADMIN_EMAILS` ל־Preview | הערך מוצפן ולא ניתן למשיכה ב־CLI | אופציונלי: להוסיף ידנית גם ל־Preview |

---

## 0. מיגרציה — כבר בוצע (לתיעוד)

מיגרציה `20260731160000_issued_document_sequence` יוצרת את טבלת המונה `IssuedDocumentSequence` (מספור מסמכים אטומי).

**אימות מקומי (עם `.env.local` שמצביע לפרוד / DIRECT):**

```bash
npm run db:migrate:prod
npx prisma migrate status
```

צפוי: `Database schema is up to date!`  
אם חסר — להריץ `migrate deploy` **לפני** פריסת קוד שמסתמך על המונה (אחרת מספרים עלולים לחזור ל־1001).

---

## 1. בידוד Preview מפרודקשן (Neon + Vercel)

### למה זה חשוב

בלי בידוד, Preview של PR עלול לכתוב/למחוק נתונים אמיתיים בפרוד.  
**אסור** להעתיק את `DATABASE_URL` של Production לסביבת Preview.

### שלב א׳ — Neon: סניף `preview`

1. היכנסו ל־[Neon Console](https://console.neon.tech) → הפרויקט של BSD-YBM.
2. תחת **Branches** — צרו branch קבוע בשם `preview` (מבוסס על `production` או main branch שלכם).
3. בסניף `preview` העתיקו שתי מחרוזות:
   - **Pooled** → ישמש כ־`DATABASE_URL` (בדרך כלל כולל `-pooler` ב־host)
   - **Direct** → ישמש כ־`DIRECT_URL` (בלי pooler; למיגרציות)

שמרו אותן בסיסמה / `.env.local` כ:

```env
PREVIEW_DATABASE_URL=postgresql://...pooler.../neondb?...
PREVIEW_DIRECT_URL=postgresql://.../neondb?...
```

ודאו שה־host של Preview **שונה** מזה של Production.

### שלב ב׳ — Vercel: משתני Preview בלבד

1. Vercel → הפרויקט → **Settings → Environment Variables**.
2. הגדירו (או עדכנו) לכל משתנה בנפרד:

| משתנה | Environment | ערך |
|--------|-------------|------|
| `DATABASE_URL` | **Preview** בלבד | מחרוזת pooled של סניף `preview` |
| `DIRECT_URL` | **Preview** בלבד | מחרוזת direct של סניף `preview` |
| `DATABASE_URL` | **Production** | נשאר על סניף production (לא לגעת) |
| `DIRECT_URL` | **Production** | נשאר על production |

3. אופציונלי ל־Preview: מפתחות sandbox לתשלומים / מייל / webhooks — לא endpoints אמיתיים של פרוד.

### שלב ג׳ — דחיפה מסקריפט מקומי (אופציונלי)

אם משתמשים ב־`scripts/vercel-push-env-from-local.mjs`:

- הסקריפט **לא** דוחף DB של פרוד ל־Preview.
- הוא דורש `PREVIEW_DATABASE_URL` / `PREVIEW_DIRECT_URL` מפורשים.

### שלב ד׳ — אימות

```bash
npm run ops:verify-preview-db
```

**ירוק:** Production ו־Preview מצביעים ל־host/DB שונים.  
**אדום / WARN:** Preview עדיין לא מוגדר — חזרו לשלב א׳–ב׳.

אחרי שינוי env ב־Vercel: **Redeploy** ל־Preview (או PR חדש) כדי שהערכים ייכנסו לתוקף.

### מיגרציות על Preview

על DB של Preview (עם `DIRECT_URL` של preview):

```bash
# דוגמה: להגדיר זמנית DIRECT_URL/DATABASE_URL לסניף preview ב-.env ואז:
npx prisma migrate deploy
npx prisma migrate status
```

אל תריצו migrate אוטומטי מכל PR נגד Neon משותף בלי בקרה.

---

## 2. אדמיני פלטפורמה — `OS_ADMIN_EMAILS`

### למה זה חשוב

בפרודקשן הרשימה נטענת **רק מה־env**. אם ריקה — **אין** אדמין פלטפורמה (fail-closed).  
הסרת אימייל מה־env מבטלת גישה אחרי רענון session/JWT.

### שלב א׳ — הגדרה ב־Vercel

1. Settings → Environment Variables.
2. הגדירו (מומלץ רשימה אחת):

| משתנה | Environment | דוגמה |
|--------|-------------|--------|
| `OS_ADMIN_EMAILS` | **Production** (חובה) | `you@bsd-ybm.co.il,ops@bsd-ybm.co.il` |
| `OS_ADMIN_EMAIL` | אופציונלי | אימייל יחיד (תאימות לאחור) |
| אותם משתנים | Preview | מומלץ לאותן כתובות או רשימת בדיקה |

הפרדה: פסיק או `;`. אותיות גדולות/קטנות לא משנות (נורמליזציה ל־lowercase).

### שלב ב׳ — Redeploy

אחרי שמירה — **Redeploy Production** (הגדרת env לבדה לא תמיד מרעננת את ה־runtime הישן).

### שלב ג׳ — אימות

1. התחברו עם אימייל שמופיע ברשימה.
2. פתחו ניהול פלטפורמה (platform admin / `/app/admin` או הווידג׳ט המתאים).
3. (אופציונלי) הסירו זמנית אימייל מהרשימה → redeploy → ודאו שאין גישת אדמין אחרי יציאה וכניסה מחדש → החזירו.

---

## 3. Google — Redirect לחיבור חשבון לכניסה

### למה זה חשוב

קישור עיוור לפי אימייל בוטל. משתמשים עם סיסמה / הזמנה מקשרים Google במפורש דרך:

**הגדרות → חיבור Google לכניסה** → `/api/auth/google-link`

בלי URI רשום ב־Google Console הזרימה תיכשל ב־`redirect_uri_mismatch`.

### שלב א׳ — Google Cloud Console

1. [Google Cloud Console](https://console.cloud.google.com) → הפרויקט של האפליקציה.
2. **APIs & Services → Credentials** → ה־OAuth 2.0 Client המתאים להתחברות (Sign-in / אותו client כמו NextAuth אם אין פיצול).
3. תחת **Authorized redirect URIs** הוסיפו **בדיוק**:

```text
https://www.bsd-ybm.co.il/api/auth/google-link/callback
```

4. ודאו שגם אלה קיימים (לפי [RUNBOOK](../RUNBOOK.md)):

| זרימה | URI |
|--------|-----|
| NextAuth | `https://www.bsd-ybm.co.il/api/auth/callback/google` |
| חיבור Google לכניסה | `https://www.bsd-ybm.co.il/api/auth/google-link/callback` |
| Drive reconnect | `https://www.bsd-ybm.co.il/api/auth/google-reconnect/callback` |
| יומן | `https://www.bsd-ybm.co.il/api/integrations/google/calendar/callback` |

5. שמרו. המתינו דקה־שתיים להתפשטות.

### שלב ב׳ — Vercel Auth URL

ודאו ב־Production:

- `NEXTAUTH_URL=https://www.bsd-ybm.co.il`
- `AUTH_URL=https://www.bsd-ybm.co.il`

(עם **www** — חייב להתאים ל־redirect.)

### שלב ג׳ — בדיקה באפליקציה

1. התחברו עם **אימייל + סיסמה** (משתמש קיים בלי Account של Google).
2. הגדרות → **חיבור Google לכניסה**.
3. אשרו בחלון Google (אימייל מאומת חייב להיות זהה לחשבון במערכת).
4. חזרו לאתר עם `google_link=ok` (או הודעת הצלחה).
5. התנתקו → התחברו עם Google — אמור לעבוד.

**ייבוא אנשי קשר (CRM):** דורש גם scope `contacts.readonly` + הפעלת People API, ואז **חיבור מחדש ל־Google** (Reconnect) בהגדרות.

---

## 4. CSP_STRICT — בדיקת עשן

### שלב א׳ — env

ב־Vercel:

| משתנה | ערך | Environment |
|--------|------|-------------|
| `CSP_STRICT` | `true` | קודם **Preview**, אחרי ירוק גם **Production** |

אחרי שינוי — Redeploy לסביבה הרלוונטית.

### שלב ב׳ — Preview smoke (דפדפן)

פתחו URL של Preview → DevTools → **Console**.  
סמנו שאין `Refused to ... because it violates Content Security Policy`.

| # | תרחיש | איך |
|---|--------|-----|
| 1 | התחברות Google | `/login` |
| 2 | חיבור Google לכניסה | הגדרות → Connect Google for sign-in |
| 3 | PayPal | הגדרות → תשלום |
| 4 | PayPlus | יצירת חשבונית / קישור תשלום |
| 5 | Gemini Live | Omnibar → מיקרופון |
| 6 | App Builder | פתיחת הווידג׳ט + preview ב־iframe |
| 7 | PostHog | אין חסימת `*.posthog.com` / `*.i.posthog.com` |
| 8 | NotebookLM | שאלה אחת במחברת |

רשימה מלאה: [csp-production-checklist.md](../csp-production-checklist.md).

### שלב ג׳ — Production

רק אחרי ש־Preview ירוק:

1. `CSP_STRICT=true` ב־Production (אם עדיין לא).
2. Redeploy.
3. חזרו על אותם תרחישים ב־`https://www.bsd-ybm.co.il`.

### אם יש violation

עדכנו ב־`next.config.js` את כותרת `Content-Security-Policy` (`connect-src` / `frame-src` / `script-src`) ופרסו מחדש.

---

## פקודות אימות מהירות (מהמחשב)

מהשורש של הריפו, עם `.env.local` תקין:

```bash
# בידוד Preview מול Production (משווה host/DB — לא מדפיס סודות מלאים)
npm run ops:verify-preview-db

# בדיקת עקביות SQL/סכמה ב-Runbook
npm run ops:validate-runbook

# מיגרציות + סטטוס (DIRECT_URL)
npm run db:migrate:prod
npx prisma migrate status

# התאמת מפתחות תרגום he/en/ru
npm run i18n:parity
```

---

## צ׳קליסט סיום (סמנו ידנית)

- [ ] סניף Neon `preview` קיים ומבודד
- [ ] Vercel Preview: `DATABASE_URL` / `DIRECT_URL` מצביעים ל־preview בלבד
- [ ] `npm run ops:verify-preview-db` בלי WARN על Preview חסר
- [ ] `OS_ADMIN_EMAILS` ב־Production + redeploy + כניסת אדמין עובדת
- [ ] Redirect `…/api/auth/google-link/callback` רשום ב־Google
- [ ] חיבור Google לכניסה עובד אחרי credentials
- [ ] `CSP_STRICT=true` ב־Preview + smoke ירוק
- [ ] אותו smoke ב־Production אחרי Preview

כשכל השורות מסומנות — סגירת ההקשחה הושלמה תפעולית.
