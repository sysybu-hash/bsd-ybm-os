/** סף נוכחות — מנוי נחשב מחובר אם lastSeenAt בתוך החלון */
export const PRESENCE_ONLINE_MS = 3 * 60_000;
export const PRESENCE_AWAY_MS = 30 * 60_000;

export type PresenceStatus = "online" | "away" | "offline";

export function presenceStatusFromLastSeen(
  lastSeenAt: Date | string | null | undefined,
  now = Date.now(),
): PresenceStatus {
  if (!lastSeenAt) return "offline";
  const t = typeof lastSeenAt === "string" ? Date.parse(lastSeenAt) : lastSeenAt.getTime();
  if (!Number.isFinite(t)) return "offline";
  const age = now - t;
  if (age <= PRESENCE_ONLINE_MS) return "online";
  if (age <= PRESENCE_AWAY_MS) return "away";
  return "offline";
}

export function truncateUserAgent(ua: string | null | undefined, max = 280): string | null {
  if (!ua) return null;
  const trimmed = ua.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export async function readClientRequestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    const ip =
      forwarded?.split(",")[0]?.trim() ||
      h.get("x-real-ip")?.trim() ||
      null;
    return { ip, userAgent: truncateUserAgent(h.get("user-agent")) };
  } catch {
    return { ip: null, userAgent: null };
  }
}
