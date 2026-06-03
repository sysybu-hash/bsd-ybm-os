import { NextResponse } from "next/server";
import { jsonServerError } from "@/lib/api-json";
import { createPasskeyAuthenticationOptions } from "@/lib/auth/passkey-server";
import { createLogger } from "@/lib/logger";

const log = createLogger("auth-passkey-auth-options");

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { email?: string };
    const email = typeof body.email === "string" ? body.email.trim() : undefined;
    const { options, challengeKey } = await createPasskeyAuthenticationOptions(email);
    return NextResponse.json({ ok: true, options, challengeKey });
  } catch (e) {
    log.error("passkey auth-options failed", { error: e instanceof Error ? e.message : String(e) });
    return jsonServerError("שגיאה בהכנת כניסה ביומטרית");
  }
}
