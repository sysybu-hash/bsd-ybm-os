/**
 * Shared client for Omnibar / Universal Command / assistant tools.
 * Always hits GET /api/search (capped semantic search on the server).
 */

export type WorkspaceSearchHit = {
  type: string;
  id: string;
  name: string;
  relevance?: number;
};

export async function fetchWorkspaceSearch(
  query: string,
  opts?: { preview?: boolean; signal?: AbortSignal },
): Promise<WorkspaceSearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const params = new URLSearchParams({ q });
  if (opts?.preview) params.set("preview", "true");

  const res = await fetch(`/api/search?${params.toString()}`, {
    credentials: "include",
    signal: opts?.signal,
  });
  if (!res.ok) return [];

  const data = (await res.json()) as { results?: WorkspaceSearchHit[] } | WorkspaceSearchHit[];
  if (Array.isArray(data)) return data;
  return Array.isArray(data.results) ? data.results : [];
}
