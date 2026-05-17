/** מטמון בזיכרון ל־/api/scan/engine-meta (5 דקות) */
const CACHE_MS = 5 * 60 * 1000;
let cache: { data: unknown; at: number } | null = null;

export async function fetchEngineMetaCached(): Promise<unknown | null> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.data;
  try {
    const res = await fetch("/api/scan/engine-meta");
    if (!res.ok) return null;
    const data = await res.json();
    cache = { data, at: now };
    return data;
  } catch {
    return null;
  }
}

export function clearEngineMetaCache(): void {
  cache = null;
}
