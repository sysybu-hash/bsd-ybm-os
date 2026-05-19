# בדיקת CSP בייצור (אחרי deploy)

פתחו DevTools → Console ובדקו שאין `Refused to ... because it violates Content Security Policy`.

## תרחישים

- [ ] התחברות Google (`/login`)
- [ ] PayPal modal (הגדרות → תשלום)
- [ ] קישור PayPlus (יצירת חשבונית)
- [ ] Gemini Live (Omnibar → מיקרופון)
- [ ] שאלה ב-NotebookLM

## אם יש violation

עדכנו את `Content-Security-Policy` ב-[`next.config.js`](../next.config.js) תחת `headers()`:

- `connect-src` — API חיצוניים
- `frame-src` — מודלים / checkout
- `script-src` — SDK צד שלישי

## משימה 1 — DocumentDraft ב-Neon ייצור

```bash
npx prisma db execute --file prisma/migrations/add_document_draft.sql --schema prisma/schema.prisma
```

אימות: `\d "DocumentDraft"` ב-`psql`.

## משימה 2 — Sentry ב-Vercel

| משתנה | הערה |
|--------|------|
| `NEXT_PUBLIC_SENTRY_DSN` | DSN ציבורי |
| `SENTRY_DSN` | אותו ערך |
| `SENTRY_ORG`, `SENTRY_PROJECT` | מ-Sentry |
| `SENTRY_AUTH_TOKEN` | releases (אופציונלי) |

Production + Preview + Development.
