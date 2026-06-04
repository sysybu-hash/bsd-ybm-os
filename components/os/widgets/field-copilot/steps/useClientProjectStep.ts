"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { FieldCopilotDraft } from "@/lib/validation/schemas/field-copilot";
import {
  canAdvanceFromClientStep,
  mapProjectRow,
  mergeSearchResults,
  type ContactRow,
  type ProjectListItem,
  type ResultRow,
  type SearchPreviewRow,
} from "@/lib/field-copilot/client-step";

export type ClientMode = "list" | "manual";

type Params = {
  draft: FieldCopilotDraft | null;
  onUpdate: (patch: Record<string, unknown>) => Promise<void>;
};

/**
 * State + effects + selection handlers for the field-copilot client/project step.
 * Extracted from ClientProjectStep.tsx to keep the component a thin render layer.
 */
export function useClientProjectStep({ draft, onUpdate }: Params) {
  const { t } = useI18n();
  const [mode, setMode] = useState<ClientMode>("list");
  const [manualName, setManualName] = useState(() => draft?.contactName ?? "");
  const [query, setQuery] = useState("");
  const [defaultProjects, setDefaultProjects] = useState<ResultRow[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectBusy, setSelectBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setListLoading(true);
      try {
        const res = await fetch("/api/projects", { credentials: "include" });
        if (!res.ok) throw new Error("projects");
        const json = (await res.json()) as { projects?: ProjectListItem[] };
        const rows = (json.projects ?? [])
          .slice()
          .sort((a, b) => {
            const aActive = a.isActive !== false ? 1 : 0;
            const bActive = b.isActive !== false ? 1 : 0;
            if (bActive !== aActive) return bActive - aActive;
            return a.name.localeCompare(b.name, "he");
          })
          .map(mapProjectRow);
        if (!cancelled) setDefaultProjects(rows);
      } catch {
        if (!cancelled) {
          setDefaultProjects([]);
          setSearchError(t("workspaceWidgets.fieldCopilot.projectsLoadError"));
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }
    const tmo = setTimeout(async () => {
      setLoading(true);
      setSearchError(null);
      try {
        const q = encodeURIComponent(query.trim());
        const [contactsRes, previewRes] = await Promise.all([
          fetch(`/api/crm/contacts?q=${q}&take=8`, { credentials: "include" }),
          fetch(`/api/search?q=${q}&preview=true`, { credentials: "include" }),
        ]);

        if (!contactsRes.ok && !previewRes.ok) {
          setResults([]);
          setSearchError(t("workspaceWidgets.fieldCopilot.searchError"));
          return;
        }

        const contactsData = contactsRes.ok
          ? ((await contactsRes.json()) as { contacts?: ContactRow[] })
          : { contacts: [] };
        const previewData = previewRes.ok
          ? ((await previewRes.json()) as { results?: SearchPreviewRow[] })
          : { results: [] };

        setResults(
          mergeSearchResults(contactsData.contacts ?? [], previewData.results ?? []),
        );
      } catch {
        setResults([]);
        setSearchError(t("workspaceWidgets.fieldCopilot.searchError"));
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(tmo);
  }, [query, t]);

  const selectRow = async (row: ResultRow) => {
    setSelectBusy(true);
    try {
      if (row.kind === "contact") {
        await onUpdate({
          contactId: row.contactId,
          contactName: row.contactName,
          projectId: row.projectId,
          projectName: row.projectName,
        });
        return;
      }

      let contactId: string | null = null;
      let contactName: string | null = null;
      if (row.projectId) {
        const res = await fetch(`/api/projects/${row.projectId}`, { credentials: "include" });
        if (res.ok) {
          const data = (await res.json()) as {
            primaryContact?: { id: string; name: string } | null;
          };
          contactId = data.primaryContact?.id ?? null;
          contactName = data.primaryContact?.name ?? null;
        }
      }

      await onUpdate({
        contactId,
        contactName,
        projectId: row.projectId,
        projectName: row.projectName,
      });
    } finally {
      setSelectBusy(false);
    }
  };

  const applyManualClient = async () => {
    const name = manualName.trim();
    if (name.length < 2) return;
    setSelectBusy(true);
    try {
      await onUpdate({ contactId: null, contactName: name });
    } finally {
      setSelectBusy(false);
    }
  };

  const selectManualProject = async (row: ResultRow) => {
    setSelectBusy(true);
    try {
      await onUpdate({
        contactId: null,
        contactName: manualName.trim() || draft?.contactName || null,
        projectId: row.projectId,
        projectName: row.projectName,
      });
    } finally {
      setSelectBusy(false);
    }
  };

  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length >= 2;
  const displayResults = isSearching
    ? results
    : trimmedQuery.length === 1
      ? defaultProjects.filter((row) => row.name.toLowerCase().includes(trimmedQuery.toLowerCase()))
      : defaultProjects;

  const hasSelection = canAdvanceFromClientStep(draft);
  const showEmpty =
    !listLoading && !loading && isSearching && displayResults.length === 0 && !searchError;
  const showProjectsEmpty =
    !listLoading && !isSearching && trimmedQuery.length === 0 && defaultProjects.length === 0 && !searchError;

  return {
    t,
    mode, setMode,
    manualName, setManualName,
    query, setQuery,
    defaultProjects,
    listLoading, loading,
    searchError,
    selectBusy,
    trimmedQuery, isSearching,
    displayResults,
    hasSelection,
    showEmpty, showProjectsEmpty,
    selectRow, applyManualClient, selectManualProject,
  };
}
