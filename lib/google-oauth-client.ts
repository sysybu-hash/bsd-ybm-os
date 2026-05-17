import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

export class GoogleOAuthNotLinkedError extends Error {
  constructor() {
    super("חשבון Google לא מחובר. התחברו עם Google מהמסך login.");
    this.name = "GoogleOAuthNotLinkedError";
  }
}

export class GoogleOAuthRefreshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleOAuthRefreshError";
  }
}

import { PRODUCTION_SITE_URL, resolveSiteBaseUrl } from "@/lib/site-url";

export function getGoogleOAuthRedirectUri(): string {
  const base = resolveSiteBaseUrl() ?? PRODUCTION_SITE_URL;
  const normalized = base.replace(/\/$/, "");
  return normalized.endsWith("/api/auth/callback/google")
    ? normalized
    : `${normalized}/api/auth/callback/google`;
}

/**
 * OAuth2 עם רענון access token ושמירה ב-Account (NextAuth / Prisma).
 */
export async function getGoogleOAuth2ClientForUser(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });

  if (!account?.access_token && !account?.refresh_token) {
    throw new GoogleOAuthNotLinkedError();
  }

  if (!account.refresh_token) {
    const expiresAtMs = account.expires_at ? account.expires_at * 1000 : 0;
    const accessValid =
      Boolean(account.access_token) && expiresAtMs > Date.now() + 60_000;
    if (!accessValid) {
      throw new GoogleOAuthRefreshError(
        "נדרש חיבור מחדש ל-Google (חסר refresh token). לחצו «התחברות מחדש» — ייפתח אישור מלא מ-Google.",
      );
    }
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getGoogleOAuthRedirectUri(),
  );

  oauth2.setCredentials({
    access_token: account.access_token ?? undefined,
    refresh_token: account.refresh_token ?? undefined,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  oauth2.on("tokens", (tokens) => {
    const data: {
      access_token?: string;
      refresh_token?: string;
      expires_at?: number;
    } = {};
    if (tokens.access_token) data.access_token = tokens.access_token;
    if (tokens.refresh_token) data.refresh_token = tokens.refresh_token;
    if (tokens.expiry_date) data.expires_at = Math.floor(tokens.expiry_date / 1000);
    if (Object.keys(data).length === 0) return;
    void prisma.account
      .update({
        where: { id: account.id },
        data,
      })
      .catch((err) => console.error("[google-oauth] token persist failed", err));
  });

  const expiresAtMs = account.expires_at ? account.expires_at * 1000 : 0;
  const needsRefresh =
    Boolean(account.refresh_token) &&
    (!account.access_token || expiresAtMs < Date.now() + 60_000);

  if (needsRefresh) {
    try {
      const { credentials } = await oauth2.refreshAccessToken();
      oauth2.setCredentials(credentials);
      await prisma.account.update({
        where: { id: account.id },
        data: {
          access_token: credentials.access_token ?? account.access_token,
          refresh_token: credentials.refresh_token ?? account.refresh_token,
          expires_at: credentials.expiry_date
            ? Math.floor(credentials.expiry_date / 1000)
            : account.expires_at,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new GoogleOAuthRefreshError(
        `פג תוקף החיבור ל-Google. התנתקו והתחברו שוב עם Google. (${msg.slice(0, 120)})`,
      );
    }
  }

  return oauth2;
}
