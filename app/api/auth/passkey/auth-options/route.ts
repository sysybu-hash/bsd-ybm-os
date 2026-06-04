import { NextRequest, NextResponse } from "next/server";
import { jsonServerError } from "@/lib/api-json";
import { createPasskeyAuthenticationOptions } from "@/lib/auth/passkey-server";
import { applyRateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("auth-passkey-auth-options");

export async function POST(req: NextRequest) {
  // 15 לדקה per IP — מונע enumeration של חשבונות דרך אתגרי passkey
  const limited = await applyRateLimit(req, "auth:passkey-auth-options", 15, 60_000);
  if (limited) return limited;
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
