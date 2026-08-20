# ביקורת N+1 — נקודות ליבה

> סקירה ראשונית 2026-05-24. הרחבה ב-PRs נפרדים לפי route.
>
> **ביקורת מלאה 2026-07-05 — נקי.** נסרקו כל 232 נתיבי ה-API:
> - נתיבי הרשימות החמים (`crm/contacts`, `erp/documents`) — `findMany` יחיד + מיפוי בזיכרון. אין N+1.
> - `prisma` בתוך לולאות נמצא רק בזרימות ייבוא/סנכרון באצווה (Excel import,
>   Meckano sync, Drive to-notebook) — סדרתי במכוון: טיפול שגיאות פר-שורה,
>   מגבלות קצב של API חיצוני, ותקרת פריטים (≤8). לא נתיב חם.
> - בדיקה חוזרת: `for f in $(grep -rln "for (const" app/api --include=route.ts); do ...` (ראו היסטוריית ביקורת).

## כלל

אין `prisma.*` בתוך `.map()` — השתמשו ב-`include` / `findMany` אחד + מיפוי בזיכרון.

## routes לבדיקה תקופתית

| Route | סיכון | המלצה |
|-------|--------|--------|
| `app/api/crm/*` | רשימת contacts + projects | `include: { projects: true }` |
| `app/api/projects/*` | tasks per project | batch `task.findMany({ where: { projectId: { in: ids } } })` |
| `app/api/invoices/*` | שורות מסמך | `include: { lines: true }` |

## bundle

```bash
npm run analyze
```

ווידג'טים כבדים (Drive, Admin) — dynamic import כבר ב-Hub documents; שמרו על pattern זה.

**Baseline 2026-07-05** (דוחות: `.next/analyze/*.html`):
- First Load JS משותף: **105 kB** · `/workspace`: 107 kB · Middleware: 55 kB — מצוין.
- חריגים: `/terms` + `/privacy` ב-**302 kB** (כנראה layout משפטי מושך תלות כבדה —
  low-traffic, לא דחוף), `/sign/[id]` ב-174 kB (חתימה — קנבס, מוצדק).
- הערה ל-Windows: `npm run analyze` דורש prefix env בסגנון POSIX — להריץ מ-bash
  או `cross-env` (לא תוקן כדי לא להוסיף תלות; CI רץ על לינוקס).

## load test

```bash
npm run load-test:smoke
```
