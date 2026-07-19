import { Redis } from "@upstash/redis";

let redisClient: Redis | null | undefined;

/** Shared Upstash client (rate-limit, dashboard cache, pubsub). Null when env missing. */
export function getUpstashRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  try {
    if (!process.env.UPSTASH_REDIS_REST_URL && !process.env.KV_REST_API_URL) {
      redisClient = null;
      return null;
    }
    redisClient = Redis.fromEnv();
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
