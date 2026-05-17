import type { Account } from "next-auth";
import { prisma } from "@/lib/prisma";
import { PRODUCTION_SITE_URL, resolveSiteBaseUrl } from "@/lib/site-url";

const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  GOOGLE_DRIVE_SCOPE,
].join(" ");

export function getGoogleReconnectCallbackUri(): string {
  const base = resolveSiteBaseUrl() ?? PRODUCTION_SITE_URL;
  const normalized = base.replace(/\/$/, "");
  return `${normalized}/api/auth/google-reconnect/callback`;
}

/** קישור לחיבור מחדש עם אישור מלא (prompt=consent) ו-offline */
export function buildGoogleReconnectUrl(callbackUrl: string): string {
  return `/api/auth/google-reconnect?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

export function googleOAuthScopes(): string {
  return GOOGLE_OAUTH_SCOPES;
}

type TokenFields = {
  access_token?: string | null;
  refresh_token?: string | null;
  expires_at?: number | null;
  scope?: string | null;
  token_type?: string | null;
  id_token?: string | null;
};

/**
 * שומר טוקני Google ב-Account בלי למחוק refresh_token קיים אם Google לא החזיר חדש.
 */
export async function persistGoogleAccountTokens(
  userId: string,
  incoming: TokenFields,
  opts?: { providerAccountId?: string; type?: string },
): Promise<void> {
  const existing = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });

  const refresh_token =
    incoming.refresh_token?.trim() ||
    existing?.refresh_token?.trim() ||
    null;

  const data = {
    access_token: incoming.access_token ?? existing?.access_token ?? null,
    refresh_token,
    expires_at: incoming.expires_at ?? existing?.expires_at ?? null,
    scope: incoming.scope ?? existing?.scope ?? GOOGLE_OAUTH_SCOPES,
    token_type: incoming.token_type ?? existing?.token_type ?? "Bearer",
    id_token: incoming.id_token ?? existing?.id_token ?? null,
  };

  if (existing) {
    await prisma.account.update({
      where: { id: existing.id },
      data,
    });
    return;
  }

  const providerAccountId = opts?.providerAccountId?.trim();
  if (!providerAccountId) {
    throw new Error("חסר מזהה חשבון Google ליצירת קישור");
  }

  await prisma.account.create({
    data: {
      userId,
      type: opts?.type ?? "oauth",
      provider: "google",
      providerAccountId,
      ...data,
    },
  });
}

/** אחרי התחברות NextAuth — מונע מחיקת refresh_token */
export async function persistGoogleOAuthAccountFromNextAuth(
  userId: string,
  account: Account,
): Promise<void> {
  if (account.provider !== "google") return;

  await persistGoogleAccountTokens(userId, {
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expires_at: account.expires_at ?? null,
    scope: account.scope,
    token_type: account.token_type,
    id_token: account.id_token,
  });
}
