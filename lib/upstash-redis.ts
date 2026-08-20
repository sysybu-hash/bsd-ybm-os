import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

let redisClient: Redis | null | undefined;

/** Shared Upstash client (rate-limit, dashboard cache, pubsub). Null when env missing. */
export function getUpstashRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  try {
    const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
    const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
    if (!url?.trim() || !token?.trim()) {
      redisClient = null;
      return null;
    }
    redisClient = new Redis({ url, token });
    return redisClient;
  } catch {
    redisClient = null;
    return null;
  }
}

/** Test helper — reset cached client between tests */
export function __resetUpstashRedisForTests() {
  redisClient = undefined;
}
