import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { env } from "@/lib/env";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { AccountStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { isLoginBlockedEmail } from "@/lib/login-blocklist";
import { isLoginAllowedByAllowlist } from "@/lib/login-allowlist";
import { normalizeNextAuthUrlEnv } from "@/lib/normalize-nextauth-url-env";
import { applyNextAuthUrlEnv } from "@/lib/site-url";
import { googleSignInScopes } from "@/lib/google-account-tokens";
import { isGoogleSignInOAuthConfigured, getGoogleSignInCredentials } from "@/lib/google-oauth-env";
import { verifyPasskeyLoginToken } from "@/lib/auth/passkey-login-token";
import {
  SESSION_MAX_AGE_DEFAULT_SEC,
  SESSION_MAX_AGE_REMEMBER_SEC,
} from "@/lib/auth/remember-preference";
import { nextAuthCallbacks, nextAuthEvents } from "@/lib/auth/nextauth-callbacks";

applyNextAuthUrlEnv();
normalizeNextAuthUrlEnv();

const googleOAuthConfigured = isGoogleSignInOAuthConfigured();
const googleSignInCreds = getGoogleSignInCredentials();

const nextAuthUrlIsHttps = env.NEXTAUTH_URL?.trim().toLowerCase().startsWith("https://");

function authHostIsLoopback(): boolean {
  const raw = env.NEXTAUTH_URL?.trim();
  if (!raw) return false;
  try {
    const h = new URL(raw).hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  } catch {
    return false;
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: env.NEXTAUTH_SECRET ?? env.AUTH_SECRET,
  /** עוגיית __Secure-* ב-Vercel; לא על loopback HTTP (E2E / next start מקומי). */
  useSecureCookies: Boolean(
    (env.VERCEL || nextAuthUrlIsHttps) && !authHostIsLoopback(),
  ),
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_DEFAULT_SEC,
  },
  jwt: {
    maxAge: SESSION_MAX_AGE_REMEMBER_SEC,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    ...(googleOAuthConfigured && googleSignInCreds
      ? [
          GoogleProvider({
            clientId: googleSignInCreds.clientId,
            clientSecret: googleSignInCreds.clientSecret,
            /**
             * נדרש: משתמשים נוצרים ידנית / דרך הזמנה ללא Account record.
             * בלי הפלאג הזה NextAuth יזרוק OAuthAccountNotLinked.
             * הנתונים הפגומים שגרמו לבאג תוקנו ישירות ב-DB.
             */
            allowDangerousEmailAccountLinking: true,
            authorization: {
              params: {
                /** select_account בלבד — consent מלא רק ב-reconnect (Drive) / Contacts */
                prompt: "select_account",
                access_type: "offline",
                scope: googleSignInScopes(),
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
        signInToken: { label: "טוקן", type: "text" },
      },
      async authorize(credentials) {
        const signInToken = credentials?.signInToken?.trim();
        if (signInToken) {
          const userId = verifyPasskeyLoginToken(signInToken);
          if (!userId) return null;
          const user = await prisma.user.findUnique({
            where: { id: userId },
          });
          if (!user || user.accountStatus !== AccountStatus.ACTIVE) return null;
          const email = user.email.trim().toLowerCase();
          if (isLoginBlockedEmail(email)) return null;
          if (!isLoginAllowedByAllowlist(email, true)) return null;
          return {
            id: user.id,
            email,
            name: user.name ?? undefined,
          };
        }

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
  callbacks: nextAuthCallbacks,
  events: nextAuthEvents,
};
