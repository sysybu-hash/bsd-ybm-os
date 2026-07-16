# מייל — הגדרות ושליטה

## מה שלח היום?

Vercel Cron (UTC):

| Cron | שעה UTC | נתיב | תוכן |
|------|---------|------|------|
| Email Digest | 09:00 | `/api/cron/email-digest` | שטיפת תור דיג׳סט **וגם** lifecycle |
| Lifecycle | 10:00 | `/api/cron/lifecycle-emails` | סיום ניסיון + החזרת לא-פעילים |
| Collection | א׳ 08:00 | `/api/cron/collection-reminders` | תזכורות גבייה |

בישראל (קיץ): 09:00 UTC ≈ 12:00, 10:00 UTC ≈ 13:00.

## איפה מוגדר?

| שכבה | מה |
|------|-----|
| **Vercel env** | `RESEND_API_KEY` או `SMTP_*`, `MAIL_FROM` / `EMAIL_FROM`, `MAIL_REPLY_TO` |
| **קוד** | [`lib/mail-config.ts`](../lib/mail-config.ts), [`lib/mail-core.ts`](../lib/mail-core.ts), [`lib/email-digest.ts`](../lib/email-digest.ts), [`lib/lifecycle-emails.ts`](../lib/lifecycle-emails.ts) |
| **אדמין (חדש)** | ניהול BSD-YBM → לשונית **מייל** — מתגי ערוצים, From/Reply-To, ימי lifecycle, בדיקה / דיג׳סט / lifecycle ידני |
| **הסרה מרשימה** | `/api/unsubscribe` (קבלת מייל נכנסת / IMAP — **לא** נתמכת) |

## שליטה

1. היכנס כ-OS Admin → `/app/admin` או וידג׳ט ניהול.
2. לשונית **מייל**.
3. כבה/הפעל ערוצים → **שמור הגדרות מייל**.
