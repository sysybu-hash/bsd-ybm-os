# מודל נתונים — הפניה ל-Prisma

מקור האמת: [`prisma/schema.prisma`](../prisma/schema.prisma).

## ישויות ליבה

| מודל | תיאור |
|------|--------|
| `Organization` | טננט / ארגון |
| `User` / `Account` / `Session` | NextAuth |
| `Project` / `Task` | פרויקטים |
| `Contact` | CRM |
| `Invoice` / `Quote` | מסמכים פיננסיים |
| `FieldCopilotSession` / `FieldCopilotAsset` | קופיילוט שטח |
| `KnowledgeVaultEntry` | מאגר ידע |

## מיגרציות

- יצירה: SQL ב-`prisma/migrations/` (Neon — ללא shadow DB).
- הפעלה מקומית: `npm run db:migrate`.

## ויזואליזציה

```bash
npx prisma studio
```

ל-ERD גרפי: ייבוא `schema.prisma` ל-[dbdiagram.io](https://dbdiagram.io) או Prisma ERD (תצוגת Studio).
