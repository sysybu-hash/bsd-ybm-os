import type { Client } from "./types";
import { mapIssuedDocuments } from "./constants";

export function mapContactRow(c: Record<string, unknown>): Client {
  const project = c.project as { id?: string; name?: string } | null | undefined;
  const rawTags = c.tags;
  const tags = Array.isArray(rawTags) ? rawTags.map(String) : [];
  return {
    id: String(c.id),
    name: String(c.name ?? ""),
    email: (c.email as string | null) ?? null,
    phone: (c.phone as string | null) ?? null,
    notes: (c.notes as string | null) ?? null,
    status: (String(c.status ?? "active").toLowerCase() as Client["status"]) || "active",
    lastContact: String(c.createdAt ?? new Date().toISOString()),
    totalProjects: project?.id ? 1 : 0,
    projectId: project?.id ?? null,
    projectName: project?.name ?? null,
    issuedDocuments: mapIssuedDocuments(c.issuedDocuments),
    tags,
  };
}
