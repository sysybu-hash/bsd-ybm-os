import { NextRequest, NextResponse } from "next/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { AccountStatus } from "@prisma/client";
import { jsonBadRequest, jsonServerError } from "@/lib/api-json";
import { verifyPasskeyAuthentication } from "@/lib/auth/passkey-server";
import { createPasskeyLoginToken } from "@/lib/auth/passkey-login-token";
import { applyRateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("auth-passkey-auth-verify");

export async function POST(req: NextRequest) {
  // 10 ניסיונות ל-5 דקות per IP — מגן על brute-force
  const limited = await applyRateLimit(req, "auth:passkey-verify", 10, 5 * 60_000);
  if (limited) return limited;
  try {
    const body = (await req.json()) as {
      response?: AuthenticationResponseJSON;
      challengeKey?: string;
    };
    if (!body.response || !body.challengeKey) {
      return jsonBadRequest("חסרים נתוני אימות");
    }
    const user = await verifyPasskeyAuthentication(body.response, body.challengeKey);
    if (user.accountStatus !== AccountStatus.ACTIVE) {
      return jsonBadRequest("החשבון אינו פעיל. פנו למנהל המערכת.");
    }
    const signInToken = createPasskeyLoginToken(user.id);
    return NextResponse.json({ ok: true, signInToken, email: user.email });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "challenge_expired" || msg === "unknown_credential" || msg === "verification_failed") {
      return jsonBadRequest("כניסה ביומטרית נכשלה. נסו אימייל וסיסמה או Google.");
    }
    log.error("passkey auth-verify failed", { error: e instanceof Error ? e.message : String(e) });
    return jsonServerError("שגיאה בכניסה ביומטרית");
  }
}
