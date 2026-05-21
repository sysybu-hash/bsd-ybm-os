# Web Push — יומן עבודה

## דרישות סביבה

- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — מפתחות Web Push (ראו `.env.example`)
- `CRON_SECRET` — לאימות `GET /api/cron/work-diary-push`

## זרימה

1. **הרשמה:** הלקוח קורא `GET /api/push/subscribe` לקבלת מפתח ציבורי, ואז `POST` עם `endpoint` + `keys` (ראו `lib/push/register-client.ts`).
2. **תזכורת יומית:** Cron מפעיל `runWorkDiaryDailyReminders` ב-`lib/push/work-diary-rules.ts` — פרויקטים פעילים ללא יומן ב-24 שעות.
3. **ירידת התקדמות:** `notifyProgressDrop` נשלח כשאחוז התקדמות ביומן יורד.

## כללי עסק

| פונקציה | תנאי |
|---------|------|
| תזכורת יומית | `isActive`, אין `workDiary` ב-24h |
| ירידת התקדמות | `next < prev` |

## Troubleshooting

- **אין התראות:** וודאו VAPID, הרשאת התראות בדפדפן, ו-`pushSubscription` ב-DB.
- **Cron 401:** כותרת `Authorization: Bearer <CRON_SECRET>`.
- **EPERM בפיתוח:** הפעילו מחדש `npm run dev` אחרי שינוי מפתחות.

קישור: [מרכז שליטה לפרויקט](./project-control-center.md)
