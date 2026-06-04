/**
 * Email unsubscribe endpoint.
 *
 * Handles List-Unsubscribe headers (RFC 8058) and direct form submissions.
 * Marks the contact/user as opted-out of marketing emails.
 * Token is HMAC-signed (same pattern as password reset tokens).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/lib/env";
import { jsonBadRequest } from "@/lib/api-json";
import { checkRateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = createLogger("unsubscribe");

function verifyUnsubToken(email: string, token: string): boolean {
  const secret = env.NEXTAUTH_SECRET ?? env.AUTH_SECRET ?? "fallback";
  const expected = createHmac("sha256", secret)
    .update(`unsubscribe:${email.toLowerCase()}`)
    .digest("hex");
  try {
    return timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

/** GET — one-click unsubscribe (from email link or List-Unsubscribe header) */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const email = url.searchParams.get("email");
  const token = url.searchParams.get("token");

  if (!email || !token) {
    return NextResponse.redirect(new URL("/unsubscribe?error=missing", req.url));
  }

  if (!verifyUnsubToken(email, token)) {
    return NextResponse.redirect(new URL("/unsubscribe?error=invalid", req.url));
  }

  await markUnsubscribed(email);
  return NextResponse.redirect(new URL("/unsubscribe?success=1", req.url));
}

/** POST — form submission (for preference center) */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit(`unsubscribe:${ip}`, 10, 60 * 60 * 1000);
  if (!rl.success) {
    return NextResponse.json({ error: "יותר מדי בקשות" }, { status: 429 });
  }

  try {
    const body = (await req.json()) as { email?: string; token?: string };
    const email = body.email?.toLowerCase().trim();
    const token = body.token;

    if (!email || !token) return jsonBadRequest("חסרים פרטים", "missing_params");
    if (!verifyUnsubToken(email, token)) return jsonBadRequest("טוקן לא תקף", "invalid_token");

    await markUnsubscribed(email);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    log.error("unsubscribe_failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}

async function markUnsubscribed(email: string) {
  const normalized = email.toLowerCase().trim();

  // Mark contact opt-out via tags
  await prisma.contact.updateMany({
    where: { email: { equals: normalized, mode: "insensitive" } },
    data: {
      tags: { push: "unsubscribed" },
      status: "INACTIVE",
    },
  });

  // Mark user email opt-out (if they're a system user)
  // The User model stores this in preferences/settings per-org, so we log it
  log.info("unsubscribed", { email: normalized });
}
