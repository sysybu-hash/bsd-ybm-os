import type { Client, ProjectOption } from "./types";
import { mapContactRow } from "./crm-table-map";

export type CrmContactsQuery = {
  skip: number;
  take?: number;
  q?: string;
  tag?: string;
  ids?: string[];
};

export type CrmContactsPage = {
  clients: Client[];
  total: number;
};

export async function fetchProjectOptionsApi(): Promise<ProjectOption[]> {
  const res = await fetch("/api/projects", { credentials: "include" });
  const json = await res.json();
  if (!res.ok) return [];
  const list = Array.isArray(json.projects) ? json.projects : Array.isArray(json) ? json : [];
  return list.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }));
}

export async function postSemanticSearchApi(
  query: string,
): Promise<{ matchedIds: string[] | null; fallback: boolean; error?: string }> {
  const res = await fetch("/api/crm/semantic-search", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const data = (await res.json()) as {
    matchedIds?: string[];
    fallback?: boolean;
    error?: string;
  };
  if (!res.ok) {
    return {
      matchedIds: data.fallback ? null : [],
      fallback: Boolean(data.fallback),
      error: data.error,
    };
  }
  return {
    matchedIds: Array.isArray(data.matchedIds) ? data.matchedIds : [],
    fallback: Boolean(data.fallback),
  };
}

export async function fetchContactsPageApi(
  query: CrmContactsQuery,
  errorMessage: string,
): Promise<CrmContactsPage> {
  const params = new URLSearchParams({
    skip: String(query.skip),
    take: String(query.take ?? 50),
  });
  if (query.q) params.set("q", query.q);
  if (query.tag) params.set("tag", query.tag);
  if (query.ids?.length) params.set("ids", query.ids.join(","));

  const res = await fetch(`/api/crm/contacts?${params.toString()}`, { credentials: "include" });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || errorMessage);

  const rows = Array.isArray(data.contacts) ? data.contacts : [];
  const total = typeof data.total === "number" ? data.total : rows.length;
  return {
    clients: rows.map((c: Record<string, unknown>) => mapContactRow(c)),
    total,
  };
}

export async function fetchContactByIdApi(contactId: string): Promise<Client | null> {
  const res = await fetch(`/api/crm/contacts/${contactId}`, { credentials: "include" });
  if (!res.ok) return null;
  const data = (await res.json()) as { contact?: Record<string, unknown> };
  return data.contact ? mapContactRow(data.contact) : null;
}

export async function fetchProjectSyncMetaApi(projectId: string): Promise<{
  autoSyncCrm: boolean;
  primaryContactId: string | null;
} | null> {
  const res = await fetch(`/api/projects/${projectId}`, { credentials: "include" });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    project?: { autoSyncCrm?: boolean; primaryContactId?: string | null };
  };
  return {
    autoSyncCrm: Boolean(data.project?.autoSyncCrm),
    primaryContactId: data.project?.primaryContactId ?? null,
  };
}

export async function deleteContactApi(contactId: string): Promise<boolean> {
  const res = await fetch(`/api/crm/contacts/${contactId}`, { method: "DELETE" });
  return res.ok;
}

export async function updateContactApi(
  contactId: string,
  payload: Record<string, unknown>,
): Promise<Client | null> {
  const res = await fetch(`/api/crm/contacts/${contactId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { contact?: Record<string, unknown> };
  return json.contact ? mapContactRow(json.contact) : null;
}

export async function checkProjectChangeApi(
  contactId: string,
  nextProjectId: string,
): Promise<{ allowed?: boolean; warn?: string } | null> {
  const res = await fetch(
    `/api/crm/contacts/${contactId}/project-change-check?nextProjectId=${encodeURIComponent(nextProjectId)}`,
    { credentials: "include" },
  ).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json()) as { allowed?: boolean; warn?: string };
}

export async function importContactsApi(
  contacts: Record<string, string>[],
): Promise<{ ok: boolean; message?: string; error?: string }> {
  const res = await fetch("/api/crm/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contacts }),
  });
  const result = await res.json();
  if (!res.ok) {
    return { ok: false, error: result.error ?? "import failed" };
  }
  return { ok: true, message: result.message };
}

export type GoogleContactPreviewRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  alreadyExists?: boolean;
};

type GoogleImportApiResult = {
  ok: boolean;
  contacts?: GoogleContactPreviewRow[];
  message?: string;
  error?: string;
  code?: string;
  reauthUrl?: string;
};

function parseGoogleImportError(data: Record<string, unknown>, fallback: string): GoogleImportApiResult {
  return {
    ok: false,
    error: typeof data.error === "string" ? data.error : fallback,
    code: typeof data.code === "string" ? data.code : undefined,
    reauthUrl: typeof data.reauthUrl === "string" ? data.reauthUrl : undefined,
  };
}

export async function fetchGoogleContactsPreviewApi(
  errorMessage: string,
): Promise<GoogleImportApiResult> {
  const res = await fetch("/api/crm/contacts/import-google", { credentials: "include" });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) return parseGoogleImportError(data, errorMessage);
  const rows = Array.isArray(data.contacts) ? data.contacts : [];
  return {
    ok: true,
    contacts: rows.map((c) => {
      const row = c as Record<string, unknown>;
      return {
        id: String(row.id ?? ""),
        name: String(row.name ?? ""),
        email: typeof row.email === "string" ? row.email : null,
        phone: typeof row.phone === "string" ? row.phone : null,
        alreadyExists: Boolean(row.alreadyExists),
      };
    }),
  };
}

export async function importGoogleContactsApi(payload: {
  importAll?: boolean;
  ids?: string[];
}): Promise<GoogleImportApiResult> {
  const res = await fetch("/api/crm/contacts/import-google", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) return parseGoogleImportError(data, "Google import failed");
  return {
    ok: true,
    message: typeof data.message === "string" ? data.message : undefined,
  };
}
