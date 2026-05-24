import type { OSNotification } from "@/components/os/NotificationCenter";

export type SearchResult = {
  type: "project" | "contact";
  name: string;
  taxId?: string;
  relevance?: number;
};

export function mapFeedItemToNotification(raw: Record<string, unknown>): OSNotification {
  return {
    id: String(raw.id ?? `n-${Date.now()}`),
    title: String(raw.title ?? ""),
    message: String(raw.message ?? raw.body ?? ""),
    severity: (raw.severity as OSNotification["severity"]) ?? "info",
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    linkType: raw.linkType != null ? String(raw.linkType) : null,
    targetId: raw.targetId != null ? String(raw.targetId) : null,
  };
}
