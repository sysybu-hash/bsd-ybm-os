import { withWorkspacesAuth } from "@/lib/api-handler";
import { env } from "@/lib/env";
import { Redis } from "@upstash/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getRedis(): Redis | null {
  if (!env.UPSTASH_REDIS_REST_URL && !env.KV_REST_API_URL) {
    return null;
  }
  try {
    return Redis.fromEnv();
  } catch {
    return null;
  }
}

function emptyNotificationStream(): Response {
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(": notifications-stream-disabled\n\n"));
      const pingTimer = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 30_000);
      return () => {
        closed = true;
        clearInterval(pingTimer);
      };
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-cache",
      Connection: "keep-alive",
    },
  });
}

export const GET = withWorkspacesAuth(
  async (_req, { userId }) => {
  const redis = getRedis();
  if (!redis) {
    return emptyNotificationStream();
  }

  const eventsKey = `notifications:${userId}:events`;
  const encoder = new TextEncoder();
  let closed = false;
  let lastTs = Date.now();

  const stream = new ReadableStream({
    start(controller) {
      const ping = () => {
        if (!closed) controller.enqueue(encoder.encode(": ping\n\n"));
      };

      ping();
      const pingTimer = setInterval(ping, 15000);

      const pollTimer = setInterval(async () => {
        if (closed) return;
        try {
          const raw = await redis.lrange(eventsKey, 0, 9);
          for (const item of [...raw].reverse()) {
            const parsed = JSON.parse(String(item)) as { ts?: number; payload?: unknown };
            if ((parsed.ts ?? 0) > lastTs) {
              lastTs = parsed.ts ?? Date.now();
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(parsed.payload ?? parsed)}\n\n`),
              );
            }
          }
        } catch {
          /* ignore transient redis errors */
        }
      }, 2000);

      return () => {
        closed = true;
        clearInterval(pingTimer);
        clearInterval(pollTimer);
      };
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-cache",
      Connection: "keep-alive",
    },
  });
  },
  { rateLimit: false },
);
