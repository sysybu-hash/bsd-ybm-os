import { NextResponse } from "next/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { AccountStatus } from "@prisma/client";
import { jsonBadRequest, jsonServerError } from "@/lib/api-json";
import { verifyPasskeyAuthentication } from "@/lib/auth/passkey-server";
import { createPasskeyLoginToken } from "@/lib/auth/passkey-login-token";

export async function POST(req: Request) {
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
    console.error("passkey auth-verify", e);
    return jsonServerError("שגיאה בכניסה ביומטרית");
  }
}
