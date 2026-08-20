import type { NextAuthOptions } from "next-auth";
import { AccountStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureOSDeveloperAccount } from "@/lib/platform-developers";
import { createOSAdminAccountIfMissing } from "@/lib/provision-platform-admin";
import { isAdmin, jwtRoleForSession } from "@/lib/is-admin";
import { isLoginBlockedEmail } from "@/lib/login-blocklist";
import { isLoginAllowedByAllowlist } from "@/lib/login-allowlist";
import { sendWelcomeEmail } from "@/lib/mail";
import { persistGoogleOAuthAccountFromNextAuth } from "@/lib/google-account-tokens";
import { createLogger } from "@/lib/logger";
import { readClientRequestMeta } from "@/lib/admin/login-presence";

const log = createLogger("auth");

export const nextAuthCallbacks: NonNullable<NextAuthOptions["callbacks"]> = {
  async signIn({ user, account }) {
    if (account?.provider === "credentials") {
      return true;
    }
    if (account?.provider === "google") {
      const email = user.email?.trim().toLowerCase();
      if (!email) {
        return false;
      }
      let dbUser = await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { accountStatus: true },
      });
      if (!dbUser) {
        if (isAdmin(email)) {
          const provisioned = await createOSAdminAccountIfMissing(email, user.name);
          if (provisioned) {
            dbUser = { accountStatus: AccountStatus.ACTIVE };
          }
        }
      }
      if (!dbUser) {
        const q = new URLSearchParams({ email });
        q.set("mode", "register");
        return `/login?${q.toString()}`;
      }
      if (dbUser.accountStatus !== AccountStatus.ACTIVE) {
        const q = new URLSearchParams({ reason: "pending" });
        if (email) q.set("email", email);
        return `/login?${q.toString()}`;
      }
      if (isLoginBlockedEmail(email)) {
        return "/login?error=CredentialsSignin&reason=blocked";
      }
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
      const sessionIndustry =
        (token.organizationIndustry as string | null) ?? "CONSTRUCTION";
      session.user.organizationIndustry = sessionIndustry;
      session.user.organizationConstructionTrade =
        (token.organizationConstructionTrade as string | null) ??
        (sessionIndustry === "COMPANY_MGMT" ? "GENERAL_BUSINESS" : "GENERAL_CONTRACTOR");
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
      const emailNorm = (u.email ?? "").trim().toLowerCase();
      if (!emailNorm) {
        token.email = "";
        token.id = "";
        token.name = undefined;
        token.picture = undefined;
        token.role = "";
        token.organizationId = null;
        token.sub = "";
        return token;
      }

      const freshId = typeof u.id === "string" && u.id.length > 0 ? u.id : "";

      for (const key of Object.keys(token)) {
        if (key === "iat" || key === "exp" || key === "jti") continue;
        delete (token as Record<string, unknown>)[key];
      }

      token.sub = freshId;
      token.email = emailNorm;
      token.id = freshId;
      token.name = u.name ?? undefined;
      token.picture = u.image ?? undefined;
    }

    if (trigger === "signIn" && !user) {
      return token;
    }

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
          log.warn("DB unreachable — skipping email recovery from id", {
            error: e instanceof Error ? e.message : String(e),
          });
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
      const orgIndustry = dbUser.organization?.industry ?? "CONSTRUCTION";
      token.organizationIndustry = orgIndustry;
      token.organizationConstructionTrade =
        dbUser.organization?.constructionTrade ??
        (orgIndustry === "COMPANY_MGMT" ? "GENERAL_BUSINESS" : "GENERAL_CONTRACTOR");

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
      log.warn("DB unreachable — returning stale JWT without refresh", {
        error: e instanceof Error ? e.message : String(e),
      });
      return token;
    }
  },
};

export const nextAuthEvents: NonNullable<NextAuthOptions["events"]> = {
  async signIn({ user, account }) {
    try {
      if (account?.provider === "google" && user?.id) {
        await persistGoogleOAuthAccountFromNextAuth(user.id, account);
      }
    } catch (e) {
      log.error("[auth] persist Google tokens", e);
    }

    try {
      const emailRaw = user?.email?.trim();
      if (!emailRaw) return;

      const before = await prisma.user.findFirst({
        where: { email: { equals: emailRaw, mode: "insensitive" } },
        select: { id: true, lastLoginAt: true, name: true, organizationId: true },
      });

      const isFirstAppLogin = before != null && before.lastLoginAt == null;
      const now = new Date();

      await prisma.user.updateMany({
        where: { email: { equals: emailRaw, mode: "insensitive" } },
        data: { lastLoginAt: now, lastSeenAt: now },
      });

      if (before?.id) {
        const meta = await readClientRequestMeta();
        await prisma.loginEvent.create({
          data: {
            userId: before.id,
            organizationId: before.organizationId,
            email: emailRaw.toLowerCase(),
            provider: account?.provider ?? null,
            ip: meta.ip,
            userAgent: meta.userAgent,
            createdAt: now,
          },
        });
      }

      if (isFirstAppLogin) {
        void sendWelcomeEmail(emailRaw, before.name ?? null).catch((err) =>
          log.error("sendWelcomeEmail (first login)", err),
        );
      }
    } catch (e) {
      log.error("signIn welcome / notification", e);
    }
  },
};
