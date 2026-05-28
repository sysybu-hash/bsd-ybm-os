import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./prisma";
import { createLogger } from "./logger";

const logger = createLogger("rate-limit");

/**
 * מנהל הגבלת קצב (Rate Limiting) מבוסס בסיס נתונים לשימוש ב-Serverless.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ success: boolean; remaining: number; resetAt: Date }> {
  const now = new Date();
  
  // מציאת הרשומה או יצירתה
  const rateLimit = await prisma.rateLimit.upsert({
    where: { key },
    update: {},
    create: {
      key,
      count: 0,
      resetAt: new Date(now.getTime() + windowMs),
    },
  });

  // אם עבר הזמן — לאפס
  if (now > rateLimit.resetAt) {
    const updated = await prisma.rateLimit.update({
      where: { key },
      data: {
        count: 1,
        resetAt: new Date(now.getTime() + windowMs),
      },
    });
    return { success: true, remaining: limit - 1, resetAt: updated.resetAt };
  }

  // אם חרג מהמכסה
  if (rateLimit.count >= limit) {
    return { success: false, remaining: 0, resetAt: rateLimit.resetAt };
  }

  // עדכון מונה
  const updated = await prisma.rateLimit.update({
    where: { key },
    data: { count: { increment: 1 } },
  });

  return {
    success: true,
    remaining: limit - updated.count,
    resetAt: updated.resetAt,
  };
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** Extract a stable key from the incoming request (IP or user-id). */
export function getRateLimitKey(req: NextRequest, suffix: string): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? (forwarded.split(",")[0] ?? "unknown").trim() : "unknown";
  return `rl:${suffix}:${ip}`;
}

/**
 * Apply rate limiting to a Next.js route handler.
 * Returns a 429 Response if the limit is exceeded, or null if OK.
 *
 * @example
 * const limited = await applyRateLimit(req, "auth:forgot-password", 5, 60_000);
 * if (limited) return limited;
 */
export async function applyRateLimit(
  req: NextRequest,
  key: string,
  limit: number,
  windowMs: number,
): Promise<NextResponse | null> {
  const rateLimitKey = getRateLimitKey(req, key);
  const result = await checkRateLimit(rateLimitKey, limit, windowMs);

  if (!result.success) {
    const retryAfterSec = Math.ceil((result.resetAt.getTime() - Date.now()) / 1000);
    logger.warn("rate_limit_exceeded", { key, retryAfterSec });
    return new NextResponse(
      JSON.stringify({
        error: "יותר מדי בקשות. נסה שוב בעוד כמה דקות.",
        code: "rate_limited",
        retryAfter: retryAfterSec,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfterSec),
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(result.resetAt.getTime() / 1000)),
        },
      },
    );
  }

  return null;
}

/** מצב מכסה בלי להגדיל מונה — לתצוגת "נותרו X סריקות" */
export async function getRateLimitStatus(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ used: number; remaining: number; resetAt: Date }> {
  const now = new Date();
  const rateLimitKey = `rl:${key}`;
  const row = await prisma.rateLimit.findUnique({ where: { key: rateLimitKey } });

  if (!row || now > row.resetAt) {
    return {
      used: 0,
      remaining: limit,
      resetAt: new Date(now.getTime() + windowMs),
    };
  }

  return {
    used: row.count,
    remaining: Math.max(0, limit - row.count),
    resetAt: row.resetAt,
  };
}
