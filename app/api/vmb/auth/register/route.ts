import type { NextRequest } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import { registerWithPassword } from "@/lib/vmb/accounts";
import { isSameOrigin } from "@/lib/vmb/api";
import { authError, signedInJson } from "@/lib/vmb/auth-responses";
import { vmbRegisterBodySchema } from "@/lib/validation/schemas/vmb-auth";

export const dynamic = "force-dynamic";
const log = createLogger("vmb-auth-register");

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, "vmb:register", 5, 60 * 60_000);
  if (limited) return limited;
  if (!isSameOrigin(req)) return authError("forbidden", 403);
  try {
    const parsed = vmbRegisterBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return authError("invalid", 400);
    const result = await registerWithPassword(parsed.data);
    if (!result.ok) return authError(result.code, result.code === "exists" ? 409 : 400);
    return await signedInJson(result.userId);
  } catch (err: unknown) {
    log.error("register_failed", { error: err instanceof Error ? err.message : String(err) });
    return authError("server_error", 500);
  }
}
