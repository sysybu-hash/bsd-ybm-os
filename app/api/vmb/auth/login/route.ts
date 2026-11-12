import type { NextRequest } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import { loginWithPassword } from "@/lib/vmb/accounts";
import { isSameOrigin } from "@/lib/vmb/api";
import { authError, signedInJson } from "@/lib/vmb/auth-responses";
import { vmbLoginBodySchema } from "@/lib/validation/schemas/vmb-auth";

export const dynamic = "force-dynamic";
const log = createLogger("vmb-auth-login");

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, "vmb:login", 10, 60_000);
  if (limited) return limited;
  if (!isSameOrigin(req)) return authError("forbidden", 403);
  try {
    const parsed = vmbLoginBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return authError("invalid", 400);
    const result = await loginWithPassword(parsed.data.email, parsed.data.password);
    if (!result.ok) return authError(result.code, 401);
    return await signedInJson(result.userId);
  } catch (err: unknown) {
    log.error("login_failed", { error: err instanceof Error ? err.message : String(err) });
    return authError("server_error", 500);
  }
}
