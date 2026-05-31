import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/lib/env";

const PURPOSE = "passkey-login-v1";

function secret(): string {
  const s = env.NEXTAUTH_SECRET ?? env.AUTH_SECRET;
  if (!s?.trim()) throw new Error("NEXTAUTH_SECRET missing");
  return s.trim();
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** טוקן חד-פעמי לכניסה אחרי אימות Passkey (60 שניות) */
export function createPasskeyLoginToken(userId: string): string {
  const exp = Date.now() + 60_000;
  const body = `${PURPOSE}|${userId}|${exp}`;
  const sig = sign(body);
  return Buffer.from(`${body}|${sig}`).toString("base64url");
}

export function verifyPasskeyLoginToken(token: string): string | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const parts = raw.split("|");
    if (parts.length !== 4 || parts[0] !== PURPOSE) return null;
    const userId = parts[1]!;
    const exp = Number(parts[2]);
    const sig = parts[3]!;
    if (!userId || !Number.isFinite(exp) || Date.now() > exp) return null;
    const body = `${PURPOSE}|${userId}|${exp}`;
    const expected = sign(body);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return userId;
  } catch {
    return null;
  }
}
