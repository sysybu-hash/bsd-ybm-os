import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { AccountStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureOSDeveloperAccount } from "@/lib/platform-developers";
import { isAdmin, jwtRoleForSession } from "@/lib/is-admin";
import { verifyPassword } from "@/lib/password";
import { isLoginBlockedEmail } from "@/lib/login-blocklist";
import { isLoginAllowedByAllowlist } from "@/lib/login-allowlist";
import { sendWelcomeEmail } from "@/lib/mail";
import { normalizeNextAuthUrlEnv } from "@/lib/normalize-nextauth-url-env";
import { applyNextAuthUrlEnv } from "@/lib/site-url";

applyNextAuthUrlEnv();
normalizeNextAuthUrlEnv();

const googleOAuthConfigured =
  Boolean(process.env.GOOGLE_CLIENT_ID?.trim()) &&
  Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim());

const nextAuthUrlIsHttps = process.env.NEXTAUTH_URL?.trim().toLowerCase().startsWith("https://");

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
  /** עוגיית __Secure-* ב-Vercel גם כש-NEXTAUTH_URL בטעות ב-http */
  useSecureCookies: Boolean(process.env.VERCEL || nextAuthUrlIsHttps),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    ...(googleOAuthConfigured
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            /**
             * נדרש: משתמשים נוצרים ידנית / דרך הזמנה ללא Account record.
             * בלי הפלאג הזה NextAuth יזרוק OAuthAccountNotLinked.
             * הנתונים הפגומים שגרמו לבאג תוקנו ישירות ב-DB.
             */
            allowDangerousEmailAccountLinking: true,
            authorization: {
              params: {
                prompt: "consent select_account",
                access_type: "offline",
                include_granted_scopes: "true",
                scope:
                  "openid email profile https://www.googleapis.com/auth/drive",
              },
            },
          }),
        ]
      : []),
    CredentialsProvider({
      id: "credentials",
      name: "אימייל וסיסמה",
      credentials: {
        email: { label: "אימייל", type: "email" },
        password: { label: "סיסמה", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;
        if (!email || !password) {
          return null;
        }
        if (isLoginBlockedEmail(email)) {
          return null;
        }
        const user = await prisma.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
        });
        if (!user?.passwordHash) {
          return null;
        }
        /* Allowlist gates registration, not login for existing active users */
        if (!isLoginAllowedByAllowlist(email, user.accountStatus === AccountStatus.ACTIVE)) {
          return null;
        }
        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) {
          return null;
        }
        if (user.accountStatus !== AccountStatus.ACTIVE) {
          return null;
        }
        return {
          id: user.id,
          email: user.email.trim().toLowerCase(),
          name: user.name ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "credentials") {
        return true;
      }
      if (account?.provider === "google") {
        const email = user.email?.trim().toLowerCase();
        if (!email) {
          return false;
        }
        const dbUser = await prisma.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
          select: { accountStatus: true },
        });
        if (!dbUser) {
          return "/login?error=CredentialsSignin&reason=no_account";
        }
        if (dbUser.accountStatus !== AccountStatus.ACTIVE) {
          return "/login?error=CredentialsSignin&reason=pending";
        }
        if (isLoginBlockedEmail(email)) {
          return "/login?error=CredentialsSignin&reason=blocked";
        }
        /* Allowlist gates registration, not login for existing active users */
        if (!isLoginAllowedByAllowlist(email, dbUser.accountStatus === AccountStatus.ACTIVE)) {
          return "/login?error=CredentialsSignin&reason=allowlist";
        }
        return true;
      }
      return true;
    },
    async session({ token, session }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? "";
        session.user.role = (token.role as string) ?? "";
        session.user.organizationId = (token.organizationId as string | null) ?? null;
        if (typeof token.email === "string") {
          session.user.email = token.email;
        }
        if (typeof token.name === "string" && token.name.length > 0) {
          session.user.name = token.name;
        }
        if (typeof token.picture === "string" && token.picture.length > 0) {
          session.user.image = token.picture;
        }
        session.user.organizationIndustry =
          (token.organizationIndustry as string | null) ?? "CONSTRUCTION";
        session.user.organizationConstructionTrade =
          (token.organizationConstructionTrade as string | null) ?? "GENERAL_CONTRACTOR";
        /** הגנה כפולה: SUPER_ADMIN ב-UI/API רק ל־osOwnerEmail() — לא דרך באג ב-JWT */
        const em = typeof session.user.email === "string" ? session.user.email : "";
        if (session.user.role === "SUPER_ADMIN" && !isAdmin(em)) {
          session.user.role = "ORG_ADMIN";
        }
      }
      return session;
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        const u = user as {
          id?: string;
          email?: string | null;
          name?: string | null;
          image?: string | null;
        };
        /**
         * התחברות חדשה (signIn / signUp):
         * חובה לאפס את **כל** שדות הטוקן הישן כדי למנוע דליפת זהות.
         * באג ייצור: sysybu התחבר, jbuildgca נכנס — הטוקן נשמר עם email/id/role של sysybu
         * כי delete רגיל לא תמיד מנקה את כל ה-JWT claims.
         *
         * הפתרון: אנחנו בונים טוקן חדש לגמרי ומעתיקים רק את שדות ה-JWT הסטנדרטיים.
         */
        const emailNorm = (u.email ?? "").trim().toLowerCase();
        if (!emailNorm) {
          /* אם אין אימייל — מנקים הכל ויוצאים */
          token.email = "";
          token.id = "";
          token.name = undefined;
          token.picture = undefined;
          token.role = "";
          token.organizationId = null;
          token.sub = "";
          return token;
        }

        /* ────────────────────────────────────────────
         * ניקוי מוחלט: מאפסים את כל שדות הטוקן הקיימים
         * ומגדירים רק את מה שהמשתמש החדש מביא.
         * זה מונע כל אפשרות של דליפת שדות מ-JWT ישן.
         * ──────────────────────────────────────────── */
        const freshId = typeof u.id === "string" && u.id.length > 0 ? u.id : "";

        /* מחק שדות ישנים — כולל שדות non-standard שייתכן והצטברו */
        for (const key of Object.keys(token)) {
          if (key === "iat" || key === "exp" || key === "jti") continue; /* JWT metadata */
          delete (token as Record<string, unknown>)[key];
        }

        /* הגדר שדות חדשים */
        token.sub = freshId;
        token.email = emailNorm;
        token.id = freshId;
        token.name = u.name ?? undefined;
        token.picture = u.image ?? undefined;
        /* role ו-organizationId ייטענו מה-DB בהמשך הפונקציה */
      }

      /* ─── signIn event (trigger) ─── */
      if (trigger === "signIn" && !user) {
        /* Edge case: signIn trigger without user — shouldn't happen, but guard */
        return token;
      }

      /** ריענון JWT: יש `id` בלי `email` בטוקן — משחזרים מה-DB כדי שלא ייפול ה-UI ל-useSession ישן */
      if (!user) {
        const tid = typeof token.id === "string" && token.id.length > 0 ? token.id : null;
        const tokenEmailRaw = typeof token.email === "string" ? token.email.trim() : "";
        if (tid && !tokenEmailRaw) {
          try {
            const row = await prisma.user.findUnique({
              where: { id: tid },
              select: { email: true, accountStatus: true },
            });
            if (row?.email && row.accountStatus === AccountStatus.ACTIVE) {
              token.email = row.email.trim().toLowerCase();
            }
          } catch (e) {
            console.warn("[auth/jwt] DB unreachable — skipping email recovery from id", e);
          }
        }
      }

      const email = typeof token.email === "string" ? token.email.trim().toLowerCase() : null;
      if (!email) {
        return token;
      }

      if (isLoginBlockedEmail(email)) {
        token.id = "";
        token.role = "";
        token.organizationId = null;
        return token;
      }

      /* Allowlist is checked with existsInDb=true during JWT refresh
         because the user already passed the signIn gate. */
      if (!isLoginAllowedByAllowlist(email, true)) {
        token.id = "";
        token.role = "";
        token.organizationId = null;
        return token;
      }

      try {
        const dev = await ensureOSDeveloperAccount(email);
        if (dev) {
          token.id = dev.id;
          token.role = dev.role;
          token.organizationId = dev.organizationId;
          return token;
        }

        const dbUser = await prisma.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
          select: {
            id: true,
            role: true,
            organizationId: true,
            accountStatus: true,
            name: true,
            image: true,
            organization: {
              select: { industry: true, constructionTrade: true },
            },
          },
        });

        if (!dbUser || dbUser.accountStatus !== AccountStatus.ACTIVE) {
          token.id = "";
          token.role = "";
          token.organizationId = null;
          return token;
        }

        token.id = dbUser.id;
        token.organizationId = dbUser.organizationId;
        token.organizationIndustry = dbUser.organization?.industry ?? "CONSTRUCTION";
        token.organizationConstructionTrade =
          dbUser.organization?.constructionTrade ?? "GENERAL_CONTRACTOR";

        /**
         * הגנה כפולה: אם משתמש שאינו OS Owner קיבל SUPER_ADMIN ב-DB (באג עבר) —
         * מתקנים את ה-DB מיד ומורידים ל-ORG_ADMIN כדי שכל שאילתת DB ישירה גם מוגנת.
         */
        if (String(dbUser.role) === "SUPER_ADMIN" && !isAdmin(email)) {
          await prisma.user.update({
            where: { id: dbUser.id },
            data: { role: "ORG_ADMIN" },
          });
          token.role = "ORG_ADMIN";
        } else {
          token.role = jwtRoleForSession(email, dbUser.role);
        }

        if (dbUser.name) token.name = dbUser.name;
        if (dbUser.image) token.picture = dbUser.image;

        return token;
      } catch (e) {
        /** DB לא זמין (רשת, Neon במצב שינה, וכו') — לא מפילים את כל האפליקציה */
        console.warn("[auth/jwt] DB unreachable — returning stale JWT without refresh", e);
        return token;
      }
    },
  },
  events: {
    async signIn({ user }) {
      try {
        const emailRaw = user?.email?.trim();
        if (!emailRaw) return;

        const before = await prisma.user.findFirst({
          where: { email: { equals: emailRaw, mode: "insensitive" } },
          select: { id: true, lastLoginAt: true, name: true },
        });

        const isFirstAppLogin = before != null && before.lastLoginAt == null;

        await prisma.user.updateMany({
          where: { email: { equals: emailRaw, mode: "insensitive" } },
          data: { lastLoginAt: new Date() },
        });

        if (isFirstAppLogin) {
          void sendWelcomeEmail(emailRaw, before.name ?? null).catch((err) =>
            console.error("sendWelcomeEmail (first login)", err),
          );
        }
      } catch (e) {
        console.error("signIn welcome / notification", e);
      }
    },
  },
};
