import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonUnauthorized, jsonServerError } from "@/lib/api-json";
import { createPasskeyRegistrationOptions } from "@/lib/auth/passkey-server";
import { applyRateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("auth-passkey-register-options");

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, "auth:passkey-register-options", 5, 60_000);
  if (limited) return limited;
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    const email = session?.user?.email;
    if (!userId || !email) return jsonUnauthorized();
    const options = await createPasskeyRegistrationOptions(userId, email);
    return NextResponse.json({ ok: true, options });
  } catch (e) {
    log.error("passkey register-options failed", { error: e instanceof Error ? e.message : String(e) });
    return jsonServerError("שגיאה בהכנת רישום Passkey");
  }
}
