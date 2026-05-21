import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { authOptions } from "@/lib/auth";
import { jsonBadRequest, jsonUnauthorized, jsonServerError } from "@/lib/api-json";
import { verifyPasskeyRegistration } from "@/lib/auth/passkey-server";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return jsonUnauthorized();
    const body = (await req.json()) as {
      response?: RegistrationResponseJSON;
      deviceName?: string;
    };
    if (!body.response) return jsonBadRequest("חסרים נתוני Passkey");
    await verifyPasskeyRegistration(userId, body.response, body.deviceName);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "verify_failed";
    if (msg === "challenge_expired" || msg === "verification_failed") {
      return jsonBadRequest("אימות Passkey נכשל. נסו שוב.");
    }
    console.error("passkey register-verify", e);
    return jsonServerError("שגיאה ברישום Passkey");
  }
}
