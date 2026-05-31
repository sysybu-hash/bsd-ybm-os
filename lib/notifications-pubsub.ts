import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

let redisClient: Redis | null = null;

function getRedis(): Redis | null {
  if (redisClient) return redisClient;
  if (!env.UPSTASH_REDIS_REST_URL && !env.KV_REST_API_URL) {
    return null;
  }
  try {
    redisClient = Redis.fromEnv();
    return redisClient;
  } catch {
    return null;
  }
}

export function channelFor(userId: string) {
  return `notifications:${userId}`;
}

function eventsKey(userId: string) {
  return `notifications:${userId}:events`;
}

export async function publishNotificationEvent(userId: string, payload: unknown) {
  const redis = getRedis();
  if (!redis) return;

  const envelope = JSON.stringify({ ts: Date.now(), payload });
  await redis.lpush(eventsKey(userId), envelope);
  await redis.ltrim(eventsKey(userId), 0, 49);
  await redis.publish(channelFor(userId), envelope);
}
