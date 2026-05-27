import type { OsAssistantUserContext } from "@/lib/os-assistant/user-context";
import {
  isApiCooldown,
  markApiCooldownFromResponse,
} from "@/lib/client/api-rate-limit-backoff";

const FETCH_KEY = "api:os/assistant/context";
const CACHE_TTL_MS = 45_000;

export type OsAssistantContextPayload = {
  context?: OsAssistantUserContext;
  systemInstruction?: string;
  systemInstructionVoice?: string;
  featureFlags?: Record<string, boolean | undefined>;
};

let inflight: Promise<OsAssistantContextPayload | null> | null = null;
let cached: OsAssistantContextPayload | null = null;
let cachedAt = 0;

export function invalidateOsAssistantContextCache(): void {
  cached = null;
  cachedAt = 0;
}

export async function fetchOsAssistantContextShared(
  options?: { force?: boolean },
): Promise<OsAssistantContextPayload | null> {
  const now = Date.now();
  if (!options?.force) {
    if (isApiCooldown(FETCH_KEY)) return cached;
    if (cached && now - cachedAt < CACHE_TTL_MS) return cached;
    if (inflight) return inflight;
  }

  inflight = (async () => {
    if (!options?.force && isApiCooldown(FETCH_KEY)) return cached;

    try {
      const res = await fetch("/api/os/assistant/context", {
        credentials: "include",
        cache: "no-store",
      });
      if (markApiCooldownFromResponse(FETCH_KEY, res)) return cached;
      if (!res.ok) return null;
      const data = (await res.json()) as OsAssistantContextPayload;
      cached = data;
      cachedAt = Date.now();
      return data;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
