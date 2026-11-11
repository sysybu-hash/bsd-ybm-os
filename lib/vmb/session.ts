import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

/**
 * VisualModuBuild sessions. The cookie holds a random token; the database
 * holds only its sha256, so a leaked table cannot be replayed. Host-only
 * cookie (no Domain), so it never reaches the platform's hosts.
 */
export const VMB_SESSION_COOKIE = "vmb_session";
export const VMB_SESSION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Refresh lastSeenAt / extend expiry at most this often. */
const TOUCH_MS = 12 * 60 * 60 * 1000;

export type VmbSessionUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
};

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sessionCookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}

/** Creates a session row and returns the raw token for the cookie. */
export async function createVmbSession(userId: string): Promise<{ token: string; maxAgeSec: number }> {
  const token = newSessionToken();
  await prisma.vmbSession.create({
    data: { id: hashSessionToken(token), userId, expiresAt: new Date(Date.now() + VMB_SESSION_DAYS * DAY_MS) },
  });
  return { token, maxAgeSec: VMB_SESSION_DAYS * 24 * 60 * 60 };
}

/** The signed-in user for a cookie token, or null. Expired rows are deleted on sight. */
export async function readVmbSession(token: string | undefined | null): Promise<VmbSessionUser | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const id = hashSessionToken(token);
  const row = await prisma.vmbSession.findUnique({
    where: { id },
    select: { expiresAt: true, lastSeenAt: true, user: { select: { id: true, email: true, name: true, image: true } } },
  });
  if (!row) return null;
  const now = Date.now();
  if (row.expiresAt.getTime() <= now) {
    await prisma.vmbSession.deleteMany({ where: { id } });
    return null;
  }
  if (now - row.lastSeenAt.getTime() > TOUCH_MS) {
    await prisma.vmbSession.update({
      where: { id },
      data: { lastSeenAt: new Date(now), expiresAt: new Date(now + VMB_SESSION_DAYS * DAY_MS) },
    });
  }
  return row.user;
}

export async function deleteVmbSession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await prisma.vmbSession.deleteMany({ where: { id: hashSessionToken(token) } });
}
