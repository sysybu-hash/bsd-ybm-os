import { checkRateLimit } from "@/lib/rate-limit";

const WINDOW_MS = 60 * 60 * 1000;

/** בפיתוח אין מכסה. בפרודקשן 40 לשעה — כמו שאר נתיבי ה-AI, לא 8. */
export const FLOORPLAN_VIZ_REQUESTS_PER_HOUR = process.env.NODE_ENV === "production" ? 40 : 500;

export function isFloorplanVizRateLimitOff(): boolean {
  return process.env.NODE_ENV !== "production";
}

export async function enforceFloorplanVizRateLimit(
  orgId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; resetAt: Date; message: string }> {
  if (isFloorplanVizRateLimitOff()) return { ok: true };
  const rl = await checkRateLimit(
    `floorplan-viz:org:${orgId}:user:${userId}`,
    FLOORPLAN_VIZ_REQUESTS_PER_HOUR,
    WINDOW_MS,
  );
  if (rl.success) return { ok: true };
  return {
    ok: false,
    resetAt: rl.resetAt,
    message: `הגבלת קצב להדמיות מתוכנית. נסו שוב אחרי ${israelClockTime(rl.resetAt)}.`,
  };
}

/** Reset instants are shown to Hebrew users — local wall clock, never a raw ISO string. */
export function israelClockTime(at: Date): string {
  return at.toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
  });
}
