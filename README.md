# BSD-YBM Operating System v1.0 🚀

מערכת הניהול האחודה (All-in-One) המתקדמת בישראל, המשלבת AI, CRM ו-ERP בתשתית SaaS מודרנית.

## 🌟 יכולות ליבה

- **AI Document Processor:** סריקת חשבוניות ומסמכים באמצעות Gemini 1.5 Pro.
- **Smart ERP:** ניהול כספים ויזואלי (Recharts) עם בנק סריקות מבוסס שימוש.
- **Intelligent CRM:** ניהול לידים, הפקת הצעות מחיר ב-PDF וחתימות דיגיטליות.
- **Financial Assistant:** צ'אטבוט AI המנתח את הנתונים הפיננסיים של הארגון בזמן אמת.
- **Multi-Tenant:** הפרדה מלאה בין משקי בית, עוסקים וחברות.

## 🛠 טכנולוגיות

- **Frontend:** Next.js 15, Tailwind CSS, Shadcn/UI, Lucide.
- **Backend:** Node.js, Server Actions, NextAuth (Google).
- **Database:** PostgreSQL (Neon) via Prisma 6.
- **Payments:** Pay Plus (ישראל), PayPal (הגדרות בארגון); ללא Stripe.
- **Mobile:** Progressive Web App (PWA) support.

## 🔐 הגנה ואוטומציה

- **Middleware:** אבטחה מבוססת JWT והגנת API.
- **Notifications:** התראות מייל אוטומטיות דרך Resend.
- **Analytics:** מעקב פעולות (Activity Logs) לכל ארגון.

## 📂 מבנה בסיסי

- `app/` – ניתוב (App Router), דשבורד, API (`/api/ai`, `/api/payplus`, webhooks וכו').
- `app/actions/` – Server Actions (למשל עיבוד מסמכים).
- `components/` – רכיבי UI.
- `lib/` – Prisma, Auth, בדיקות מכסה (קרדיטים).
- `prisma/` – סכמה ומיגרציות.

## 🚀 הרצה מקומית (סיכום)

1. `npm install`
2. קובץ `.env.local` עם לפחות: `DATABASE_URL`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, מפתחות Gemini; לתשלומים — Pay Plus / PayPal לפי הצורך.
3. `npx prisma db push` (או מיגרציות לפי הסביבה).
4. `npm run dev`

---

**נבנה ועוצב ע"י יוחנן בוקשפן - יוצר AI | [www.bsd-ybm.co.il](https://www.bsd-ybm.co.il)**
