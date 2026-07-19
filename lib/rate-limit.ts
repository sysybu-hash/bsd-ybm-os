import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import type { Redis } from "@upstash/redis";
import { prisma } from "./prisma";
import { createLogger } from "./logger";
import { __resetUpstashRedisForTests, getUpstashRedis } from "./upstash-redis";

const logger = createLogger("rate-limit");

function getRedis(): Redis | null {
  return getUpstashRedis();
}

/** Test helper — reset cached Redis client between tests */
export function __resetRateLimitRedisForTests() {
  __resetUpstashRedisForTests();
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

async function getOrCreateRateLimitRow(key: string, windowMs: number) {
  const now = Date.now();
  const existing = await prisma.rateLimit.findUnique({ where: { key } });
  if (existing) return existing;

  try {
    return await prisma.rateLimit.create({
      data: {
        key,
        count: 0,
        resetAt: new Date(now + windowMs),
      },
    });
  } catch (err: unknown) {
    if (isUniqueConstraintError(err)) {
      const row = await prisma.rateLimit.findUnique({ where: { key } });
      if (row) return row;
    }
    throw err;
  }
}

async function checkRateLimitPrisma(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ success: boolean; remaining: number; resetAt: Date }> {
  const now = new Date();
  const rateLimit = await getOrCreateRateLimitRow(key, windowMs);

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

  if (rateLimit.count >= limit) {
    return { success: false, remaining: 0, resetAt: rateLimit.resetAt };
  }

  const updated = await prisma.rateLimit.update({
    where: { key },
    data: { count: { increment: 1 } },
  });

  return {
    success: true,
    remaining: Math.max(0, limit - updated.count),
    resetAt: updated.resetAt,
  };
}

async function checkRateLimitRedis(
  redis: Redis,
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ success: boolean; remaining: number; resetAt: Date }> {
  const redisKey = key.startsWith("rl:") ? key : `rl:${key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.pexpire(redisKey, windowMs);
  }
  const ttlMs = await redis.pttl(redisKey);
  const resetAt = new Date(Date.now() + (ttlMs > 0 ? ttlMs : windowMs));
  if (count > limit) {
    return { success: false, remaining: 0, resetAt };
  }
  return { success: true, remaining: Math.max(0, limit - count), resetAt };
}

/**
 * Rate limiting: Upstash Redis when configured, otherwise Prisma RateLimit table.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ success: boolean; remaining: number; resetAt: Date }> {
  const redis = getRedis();
  if (redis) {
    try {
      return await checkRateLimitRedis(redis, key, limit, windowMs);
    } catch (err) {
      logger.warn("redis_rate_limit_failed_fallback_prisma", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return checkRateLimitPrisma(key, limit, windowMs);
}

export function getRateLimitKey(req: Request, suffix: string): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? (forwarded.split(",")[0] ?? "unknown").trim() : "unknown";
  return `rl:${suffix}:${ip}`;
}

export async function applyRateLimit(
  req: Request,
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

async function getRateLimitStatusPrisma(
  rateLimitKey: string,
  limit: number,
  windowMs: number,
): Promise<{ used: number; remaining: number; resetAt: Date }> {
  const now = new Date();
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

/** מצב מכסה בלי להגדיל מונה — לתצוגת "נותרו X סריקות" */
export async function getRateLimitStatus(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ used: number; remaining: number; resetAt: Date }> {
  const rateLimitKey = key.startsWith("rl:") ? key : `rl:${key}`;
  const redis = getRedis();
  if (redis) {
    try {
      const redisKey = rateLimitKey;
      const raw = await redis.get<number | string | null>(redisKey);
      const used = raw == null ? 0 : Number(raw);
      if (!Number.isFinite(used) || used <= 0) {
        return {
          used: 0,
          remaining: limit,
          resetAt: new Date(Date.now() + windowMs),
        };
      }
      const ttlMs = await redis.pttl(redisKey);
      return {
        used,
        remaining: Math.max(0, limit - used),
        resetAt: new Date(Date.now() + (ttlMs > 0 ? ttlMs : windowMs)),
      };
    } catch (err) {
      logger.warn("redis_rate_limit_status_failed_fallback_prisma", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return getRateLimitStatusPrisma(rateLimitKey, limit, windowMs);
}
