import { createHmac, timingSafeEqual } from "crypto";

type ReconnectState = {
  userId: string;
  callbackUrl: string;
  exp: number;
};

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!s?.trim()) throw new Error("NEXTAUTH_SECRET חסר");
  return s.trim();
}

export function signGoogleReconnectState(payload: Omit<ReconnectState, "exp">, ttlMs = 10 * 60_000): string {
  const full: ReconnectState = {
    ...payload,
    exp: Date.now() + ttlMs,
  };
  const data = Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyGoogleReconnectState(state: string | null): ReconnectState | null {
  if (!state?.includes(".")) return null;
  const [data, sig] = state.split(".", 2);
  if (!data || !sig) return null;
  const expected = createHmac("sha256", secret()).update(data).digest("base64url");
  try {
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as ReconnectState;
    if (!parsed?.userId || typeof parsed.exp !== "number" || Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function safeOAuthCallbackUrl(raw: string | null): string {
  const value = (raw ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
