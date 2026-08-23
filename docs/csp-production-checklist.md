# בדיקת CSP בייצור (אחרי deploy)

פתחו DevTools → Console ובדקו שאין `Refused to ... because it violates Content Security Policy`.

**סטטוס אוטומטי (2026-07-16):**
- `CSP_STRICT=true` ב-Production + Preview (Vercel)
- כותרת `Content-Security-Policy` נוכחת ב-`https://www.bsd-ybm.co.il/` (כולל PostHog ב-`connect-src`)
- Redeploy אחרי הגדרת env הושלם עם ה-hardening / all-gaps track

## Preview לפני Production

1. ודאו `CSP_STRICT=true` ב-**Preview** (Vercel env).
2. הריצו smoke על Preview URL (להלן).
3. רק אחרי ירוק — Production.

## תרחישים (אימות בעלים — דפדפן)

סמנו אחרי בדיקה ידנית ב-Preview ואז www:

- [x] כותרת CSP פעילה בפרוד (אוטומטי)
- [ ] התחברות Google (`/login`)
- [ ] חיבור Google לכניסה (הגדרות → Connect Google for sign-in) אחרי credentials
- [ ] PayPal modal (הגדרות → תשלום)
- [ ] Gemini Live (Omnibar → מיקרופון)
- [ ] App Builder preview (iframe sandbox + אין Tailwind CDN לא־מקובע)
- [ ] PostHog (אין חסימת `us-assets.i.posthog.com` ב-Console) — `connect-src` כולל posthog ברמת כותרת
- [ ] שאלה ב-NotebookLM

## אם יש violation

עדכנו את `Content-Security-Policy` ב-[`next.config.js`](../next.config.js) תחת `headers()`:

- `connect-src` — API חיצוניים
- `frame-src` — מודלים / checkout
- `script-src` — SDK צד שלישי (PayPal, PostHog: `https://*.posthog.com`, `https://*.i.posthog.com`)

## משימה 1 — DocumentDraft ב-Neon ייצור

```bash
npx prisma db execute --file prisma/migrations/add_document_draft.sql --schema prisma/schema.prisma
```

אימות: `\d "DocumentDraft"` ב-`psql`. (41 מיגרציות כבר ירוקות בדוח 10/10 — לאמת אם חסר.)

## משימה 2 — Sentry ב-Vercel

| משתנה | הערה |
|--------|------|
| `NEXT_PUBLIC_SENTRY_DSN` | DSN ציבורי |
| `SENTRY_DSN` | אותו ערך |
| `SENTRY_ORG`, `SENTRY_PROJECT` | מ-Sentry |
| `SENTRY_AUTH_TOKEN` | releases (אופציונלי) |

Production + Preview + Development — מוגדרים בדוח מצב 2026-07-16.
