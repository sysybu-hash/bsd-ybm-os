# דוח ביקורת אבטחה ומוכנות Google OAuth

**תאריך:** מאי 2026  
**פרויקט:** BSD-YBM OS  
**היקף:** בידוד מנויים (ארגונים) / משתמשים; מוכנות לאישור Google OAuth

---

## סיכום מנהלים

| תחום | מצב לפני | מצב אחרי יישום |
|------|----------|----------------|
| בידוד tenant ב-API עסקי | טוב | טוב (ללא שינוי ארכיטקטורה) |
| זליגה בין ארגונים | לא זוהתה זליגה שיטתית; 2 פערים בינוניים | **תוקן** (quota + אימות אימייל) |
| Google OAuth verification | מוכן חלקית | **משופר** — Drive הופרד מ-login |
| אישור Google מובטח | לא | תלוי ב-Vercel, Console, סרטון, כתובת משפטית |

---

## אבטחת multi-tenant

### חוזקות

- רוב ה-API דרך `withWorkspacesAuth` — `orgId` מה-session.
- CRM, ERP, פרויקטים: `findFirst({ id, organizationId: orgId })`.
- `requireProjectForOrg` בנתיבי `[id]`.
- Launcher per-user בלבד.
- JWT מתרענן מ-DB; הגבלת `SUPER_ADMIN` לרשימת אימיילים.

### תיקונים שבוצעו

1. **`lib/quota-check.ts`** — `resolveOrganizationForUser` לא מחזיר ארגון רק כי ה-ID קיים; משתמש רגיל מוגבל ל-`user.organizationId`; מנהל פלטפורמה יכול לפתור org אחר במכוון.
2. **`app/api/org/resend-verification`** — שליחת מייל אימות רק למשתמשים ב-`ctx.orgId`.
3. **`app/api/org/check-email-verified`** — בדיקת אימות רק בתוך הארגון; שדה `foundInOrg`.

### נותר מכוון (לא באג)

- מנהל פלטפורמה: גישה cross-tenant ב-actions וב-`assign-user` ל-OS owner.
- `/api/sign/[id]` — ציבורי לפי token.
- Middleware: JWT בלבד, לא בודק `organizationId` (ה-handler דוחה).

### בדיקות אוטומטיות

- `lib/__tests__/quota-org-binding.test.ts`
- `lib/__tests__/project-access-idor.test.ts`

מפת API: [`docs/security-api-audit.md`](security-api-audit.md)

---

## Google OAuth — האם האתר יכול לקבל אישור?

### Scopes

| שלב | Scopes |
|-----|--------|
| התחברות (`lib/auth.ts`) | `openid`, `email`, `profile` |
| חיבור Drive (`google-reconnect`) | + `https://www.googleapis.com/auth/drive` (Restricted) |

זה עונה על המלצת Google להפריד sign-in מ-scopes רגישים.

### מוכן בקוד

- `/privacy`, `/terms`, `/integrations/google`
- מדריכים: `docs/google-oauth-verification-guide.md`, `docs/google-oauth-publish-checklist.md`
- `.env.example` — redirect URIs כולל reconnect

### פעולות ידניות נדרשות (מחוץ ל-repo)

1. **דומיין קנוני אחד** — `https://www.bsd-ybm.co.il` ב-Vercel (`NEXTAUTH_URL`, `NEXT_PUBLIC_SITE_URL`).
2. **Google Cloud Console** — redirect URIs ל-callback + reconnect.
3. **`NEXT_PUBLIC_LEGAL_REGISTERED_ADDRESS`** — כתובת אמיתית (לא placeholder).
4. **סרטון הדגמה** (2–5 דק) — login + חיבור Drive + שימוש ב-ERP.
5. **Submit for verification** ל-scope Drive.
6. **Brand verification** אם מעלים לוגו.

### הערכת סיכוי

- **Sign-in (profile/email):** גבוה לאחר Publish.
- **Drive restricted:** בינוני — תלוי ביישור דומיין, מדיניות, וסרטון.
- **Gemini / Document AI:** לא דורש OAuth consent — מפתחות שרת נפרדים.

---

## צעדים מומלצים להמשך

1. Deploy + מילוי env משפטי ב-Vercel.
2. הגשת verification ב-Google Cloud.
3. (אופציונלי) audit log לפעולות OS admin.
4. (אופציונלי) E2E עם שני ארגונים ב-CI (`seed:test`).
