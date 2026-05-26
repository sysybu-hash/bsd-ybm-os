# צעדים ידניים — השלמת דף המוצר (אחרי יישום הקוד)

הקוד לפי [תוכנית התאמה לדף המוצר](PRODUCT-BROCHURE-TRACEABILITY.md) כבר ב-repo. **אתה** מריץ את השלבים הבאים (בעיקר צילומים, DB, OAuth, Lighthouse).

---

## 1. מיגרציית DB (חובה לפני CRM תגיות / Meckano cron)

```powershell
cd c:\Users\User\Desktop\BSD-YBM-OS
npm run db:migrate
npx prisma generate
```

אם קיבלת `CREATE INDEX CONCURRENTLY cannot run inside a transaction block` (P3018) או `P3009` (מיגרציה failed) — המיגרציה כבר תוקנה ב-repo. הרץ (ב-PowerShell השתמש ב-`npx dotenv-cli`, לא `dotenv` ישירות):

```powershell
npx dotenv-cli -e .env.local -- npx prisma migrate resolve --rolled-back 20260526120000_contact_tags_meckano_sync
npm run db:migrate
npx prisma generate
```

> **Neon + Prisma:** במיגרציות SQL ידניות אין `CREATE INDEX CONCURRENTLY` — רק `CREATE INDEX IF NOT EXISTS` (ראה `docs/ONBOARDING.md`).

### שגיאת `P1001: Can't reach database server` (Neon)

1. ב-[Neon Console](https://console.neon.tech) → הפרויקט → **Resume** אם הפרויקט/ענף מושהה; המתינו ~10–30 שניות אחרי השכמה.
2. ודאו ב-`.env.local`: `DATABASE_URL` = חיבור **Pooled** (`…-pooler…neon.tech`), `DIRECT_URL` = חיבור **Direct** (ללא `-pooler`) — העתיקו מחדש מ-Connection details. הרצה: `npm run neon:ensure-direct` (מוסיף `DIRECT_URL` בלי להדפיס סיסמאות).
3. בדיקת חיבור ב-Windows (WebSocket, עוקף IPv6): `npm run db:migrate:status` — אם מצליח, נסו שוב `npm run db:migrate`.
4. רשת: כבו VPN/פרוקסי זמנית; בדיקת פורט: `Test-NetConnection ep-soft-field-al29j8dq.c-3.eu-central-1.aws.neon.tech -Port 5432`
5. `npx prisma generate` **לא** דורש DB — מספיק אחרי שינוי `schema.prisma` בלבד.

בודקים: בטבלת `Contact` יש עמודה `tags`; ב-`Organization` — `meckanoAutoSyncEnabled`, `meckanoLastSyncAt`.

---

## 2. צילומי מסך לדף המוצר (לא בוצע ב-Agent)

### דרישות

- שרת מקומי רץ: `npm run dev` → http://localhost:3000
- משתמש מחובר עם נתוני דמו (מומלץ: `npm run seed:test` אחרי מיגרציה)
- `.env.local` עם `E2E_EMAIL` / `E2E_PASSWORD` אם הסקריפט משתמש בהם (ראה `e2e/.env.example`)

### הרצה

```powershell
cd c:\Users\User\Desktop\BSD-YBM-OS
npm run product-brochure:capture
```

פלט צפוי: תמונות ב-`assets/product-brochure-v2/` (11 קבצים לפי `scripts/capture-product-brochure-v2.ts`).

### ייצור PDF מעודכן

```powershell
npm run product-brochure:pdf
# או הכל ביחד:
npm run product-brochure:build
```

קובץ סופי: `docs/BSD-YBM-OS-דף-מוצר.pdf` (או הנתיב שהסקריפט מדפיס).

### אם הצילום נכשל

- ודא שהווידג'טים נפתחים ידנית: `/?w=dashboard`, `crmTable`, `erpArchive`, וכו'.
- Playwright: `npx playwright install chromium`
- בדוק לוגים בסקריפט `scripts/capture-product-brochure-v2.ts`

---

## 3. Google Contacts OAuth (לייבוא CRM)

### Google Cloud Console

1. פרויקט OAuth קיים (אותו של `GOOGLE_CLIENT_ID` / `SECRET`).
2. **OAuth consent screen** → הוסף scope: `https://www.googleapis.com/auth/contacts.readonly`
3. **Credentials** → OAuth client → **Authorized redirect URIs**:
   - `http://localhost:3000/api/integrations/google/contacts/callback`
   - `https://<הדומיין-שלך>/api/integrations/google/contacts/callback`
4. במצב Testing: הוסף את המייל שלך ל-Test users.

### `.env.local`

```env
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
```

(כבר נדרש ל-Drive/התחברות — אותם ערכים.)

### בדיקה באפליקציה

1. התחבר → פתח CRM (`/?w=crmTable`).
2. לחץ **ייבוא מ-Google** → אישור Google → חזרה ל-CRM.
3. אמור להופיע toast עם מספר אנשי קשר שיובאו.

E2E מלא (אופציונלי): `set E2E_GOOGLE_CONTACTS=1` ואז `npm run test:e2e:brochure`.

---

## 4. Meckano — סנכרון אוטומטי בפרודקשן

- ב-**Vercel**: משתנה `CRON_SECRET` תואם ל-cron.
- Cron חדש ב-`vercel.json`: `/api/cron/meckano-sync` (05:00 UTC).
- אחרי deploy: ב-Vercel → Cron Jobs → הרץ ידנית פעם אחת לבדיקה.
- ב-UI: ווידג'ט Meckano מציג «סנכרון אוטומטי פעיל» + זמן סנכרון אחרון (מתעדכן אחרי cron מוצלח).

סנכרון ידני לפרויקט עדיין זמין: API פרויקט `sync-meckano`.

---

## 5. Lighthouse (נחיתה)

```powershell
npm run dev
# בטרמינל נפרד:
npm run lighthouse:sample
```

עדכן ב-`docs/LAUNCH-CHECKLIST.md` את הציונים אחרי שהרצת. אם Performance נמוך — התמקד ב-`components/landing/LandingPage.tsx` (פונטים, LCP).

---

## 6. אימות לפני merge

```powershell
npm run verify
npm run seed:test
npm run test:e2e:brochure
# מלא (ארוך):
npm run premerge
```

---

## 7. Sign-off

- סמן ב-[KPI-SIGNOFF.md](./KPI-SIGNOFF.md) ו-[PRODUCT-BROCHURE-TRACEABILITY.md](./PRODUCT-BROCHURE-TRACEABILITY.md).
- ללקוחות enterprise: מלא [PRODUCT-BROCHURE-CUSTOM-SOW.md](./PRODUCT-BROCHURE-CUSTOM-SOW.md).

---

## סיכום מהיר

| משימה | מי | פקודה / מקום |
|--------|-----|----------------|
| מיגרציה | אתה | `npm run db:migrate` |
| צילומי מסך | אתה | `npm run product-brochure:capture` |
| PDF מעודכן | אתה | `npm run product-brochure:pdf` |
| Google OAuth | אתה | Cloud Console + CRM ייבוא |
| Lighthouse | אתה | `npm run lighthouse:sample` |
| קוד + verify | בוצע ב-repo | `npm run verify` |
