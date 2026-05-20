# מרכז שליטה לפרויקט

## API

| נתיב | תיאור |
|------|--------|
| `GET /api/projects/[id]/dashboard` | נתוני ווידג'ט (פיננסי, יומן, גנט, ERP, נוכחות) |
| `GET/PATCH /api/projects/[id]` | קריאה/עדכון הגדרות פרויקט + CRM |
| `POST /api/projects/analyze-blueprint` | פענוח גרמושקה (rate limit, Gemini + OpenAI repair) |
| `*/api/projects/[id]/milestones|extras|expenses|work-diaries|tasks/schedule` | CRUD ישויות |

## משתני ENV (Gemini)

- `GOOGLE_GENERATIVE_AI_API_KEY` — חובה
- `GEMINI_MODEL` / `GOOGLE_GENERATIVE_AI_MODEL` — `gemini-3.5-flash`
- `GEMINI_BLUEPRINT_MODEL`, `BLUEPRINT_USE_FLASH_ONLY`, `GEMINI_THINKING_LEVEL`
- `GEMINI_ADMIN_ASSISTANT_MODEL` — עוזר ניהול

## עוזר ניהול (שלב ב')

- `POST /api/admin/assistant` — כלים read-only + `propose_*` (מחזיר `pendingActions`)
- `POST /api/admin/assistant/execute` — ביצוע אחרי אישור ב-UI (`actionId` + `token`, TTL 10 דק')

## QA ידני

1. פתיחת ווידג'ט `project` עם `projectId`
2. שמירת הגדרות CRM → `Contact.projectId` מתעדכן
3. העלאת גרמושקה → משימות + אבני דרך
4. גנט: ציר זמן + רשימה, עדכון progress
5. עוזר אדמין: propose → אשר → execute

## מיגרציה

```bash
npm run db:migrate
npm run db:migrate:status
```

פרודקשן: `scripts/ensure-production-schema.mjs` ב-`npm run build`.
