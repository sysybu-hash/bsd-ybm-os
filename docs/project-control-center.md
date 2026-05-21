# מרכז שליטה לפרויקט

## API

| נתיב | תיאור |
|------|--------|
| `GET /api/projects/[id]/dashboard` | נתוני ווידג'ט (פיננסי, יומן, גנט, ERP, נוכחות) |
| `GET/PATCH /api/projects/[id]` | קריאה/עדכון הגדרות פרויקט + CRM |
| `POST /api/projects/analyze-blueprint` | פענוח גרמושקה (rate limit, Gemini + OpenAI repair) |
| `*/api/projects/[id]/milestones|extras|expenses|work-diaries|tasks/schedule` | CRUD ישויות |
| `GET/PATCH /api/projects/[id]/boq` | כתב כמויות + ביצוע סעיפים |
| `POST /api/projects/[id]/import/excel` | ייבוא הצעת מחיר / חשבון (תצוגה מקדימה + confirm) |
| `GET /api/projects/[id]/export/excel` | ייצוא Excel |
| `POST /api/projects/[id]/import/schedule` | ייבוא גנט XML/CSV |
| `GET /api/projects/[id]/drive-folder` | תיקיית Drive לפרויקט |
| `POST /api/projects/[id]/sync-meckano` | נוכחות → יומן עבודות |
| `PATCH/DELETE .../work-diaries/[diaryId]` | עריכה/מחיקת יומן |
| `POST/DELETE /api/push/subscribe` | Web Push (VAPID) |

## משתני ENV (Gemini)

- `GOOGLE_GENERATIVE_AI_API_KEY` — חובה
- `GEMINI_MODEL` / `GOOGLE_GENERATIVE_AI_MODEL` — `gemini-3.5-flash`
- `GEMINI_BLUEPRINT_MODEL`, `BLUEPRINT_USE_FLASH_ONLY`, `GEMINI_THINKING_LEVEL`
- `GEMINI_ADMIN_ASSISTANT_MODEL` — עוזר ניהול

## עוזר ניהול (שלב ב')

- `POST /api/admin/assistant` — כלים read-only + `propose_*` (מחזיר `pendingActions`)
- `POST /api/admin/assistant/execute` — ביצוע אחרי אישור ב-UI (`actionId` + `token`, TTL 10 דק')

## CRM ↔ פרויקט

- `CrmTableWidget`: בחירת פרויקט, יצירת פרויקט ללקוח, **פתח מרכז שליטה**
- `syncContactToProject` / `assignContactProject` כש-`autoSyncCrm` פעיל
- מדיניות: `crmSyncPolicyJson` (`syncDirection`, `onContactProjectChange`)

## Excel / BOQ

דוגמאות: `docs/samples/project-workflow/`. טאב פיננסי במרכז פרויקט — ייבוא/ייצוא וטבלת סעיפים.

## Web Push

- ENV: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- `public/sw.js` — push + notificationclick
- Cron: `/api/cron/work-diary-push` (יומי 16:00 UTC)
- תיעוד מלא: [work-diary-push.md](./work-diary-push.md)

## QA ידני

1. פתיחת ווידג'ט `project` עם `projectId`
2. שמירת הגדרות CRM → `Contact.projectId` מתעדכן
3. העלאת גרמושקה → משימות + אבני דרך + `boqLineItems`
4. גנט: ייבוא XML/CSV, עדכון progress
5. ייבוא Excel → טבלת BOQ
6. הפעלת התראות Push במרכז פרויקט
7. עוזר אדמין: propose → אשר → execute

## מיגרציה

```bash
npm run db:migrate
npm run db:migrate:status
```

פרודקשן: `scripts/ensure-production-schema.mjs` ב-`npm run build`.
