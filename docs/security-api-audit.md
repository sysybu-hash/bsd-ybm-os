# מפת API — בידוד אימות (עדכון אוטומטי)

מסמך עזר לביקורת multi-tenant. עודכן כחלק מיישום תוכנית האבטחה.

## שכבות הגנה

| שכבה | קובץ | תפקיד |
|------|------|--------|
| Edge | `middleware.ts` | JWT לכל `/api/*` מלבד prefixes ציבוריים |
| Workspace | `lib/api-handler.ts` → `withWorkspacesAuth` | `orgId` + `userId` + `role` מה-session |
| Platform | `withOSAdmin` | מנהלי פלטפורמה (`lib/is-admin.ts`) |
| Data | Prisma | `organizationId` על ישויות עסקיות |

## Prefixes ציבוריים (ללא JWT במידלוור)

- `/api/auth` — NextAuth, Google reconnect
- `/api/register`
- `/api/webhooks`
- `/api/cron`
- `/api/sign` — חתימת הצעה לפי `token`
- `/api/org-invite`
- `/api/locale`
- `/api/analyze-queue/process` — עיבוד תור (אימות פנימי ב-handler)

## סיכום ספירה (152 קבצי `route.ts`)

| סוג | כמות משוערת | הערות |
|-----|-------------|--------|
| `withWorkspacesAuth` | ~130+ | רוב ה-API העסקי |
| `withOSAdmin` | ~15 | `app/api/admin/*`, `debug-session` |
| ציבורי / Auth | ~12 | רשימת prefixes למעלה |
| `admin/logs` | Workspace + `allowedRoles` | לא OS admin — רק ORG_ADMIN/SUPER_ADMIN ב-session |

## נתיבים שדורשים זהירות (לא באג — מכוון)

| נתיב | סיכון |
|------|--------|
| `app/api/assign-user/route.ts` | OS owner יכול לשייך לארגון אחר |
| `app/actions/manage-subscriptions.ts` | cross-tenant למנהל פלטפורמה |
| `app/api/sign/[id]/route.ts` | גישה לפי `quote.token` — סודיות הטוקן |

## תיקונים שבוצעו בביקורת זו

- `lib/quota-check.ts` — `resolveOrganizationForUser` לא מאשר org אקראי
- `app/api/org/resend-verification` — אימייל רק בארגון הנוכחי
- `app/api/org/check-email-verified` — אימייל רק בארגון הנוכחי
- `lib/auth.ts` — התחברות Google בלי scope Drive; Drive ב-reconnect בלבד

## בדיקות אוטומטיות

- `lib/__tests__/quota-org-binding.test.ts`
- `lib/__tests__/project-access-idor.test.ts`
