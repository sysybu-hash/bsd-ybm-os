# ביקורת N+1 — נקודות ליבה

> סקירה ראשונית 2026-05-24. הרחבה ב-PRs נפרדים לפי route.

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

## load test

```bash
npm run load-test:smoke
```
