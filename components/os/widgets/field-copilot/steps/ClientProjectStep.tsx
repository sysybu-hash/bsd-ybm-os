"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { FieldCopilotDraft } from "@/lib/validation/schemas/field-copilot";
import { canAdvanceFromClientStep } from "@/lib/field-copilot/client-step";

type ContactRow = {
  id: string;
  name: string;
  projectId?: string | null;
  project?: { id: string; name: string } | null;
};

type SearchPreviewRow = {
  type: "project" | "contact";
  id: string;
  name: string;
};

type ResultRow = {
  key: string;
  kind: "contact" | "project";
  name: string;
  subtitle: string | null;
  contactId: string | null;
  contactName: string | null;
  projectId: string | null;
  projectName: string | null;
};

type Props = {
  draft: FieldCopilotDraft | null;
  onUpdate: (patch: Record<string, unknown>) => Promise<void>;
};

type ClientMode = "list" | "manual";

type ProjectListItem = { id: string; name: string; isActive?: boolean };

function mapProjectRow(p: ProjectListItem): ResultRow {
  return {
    key: `project:${p.id}`,
    kind: "project",
    name: p.name,
    subtitle: null,
    contactId: null,
    contactName: null,
    projectId: p.id,
    projectName: p.name,
  };
}

function mapContactRow(c: ContactRow): ResultRow {
  const projectId = c.project?.id ?? c.projectId ?? null;
  const projectName = c.project?.name ?? null;
  return {
    key: `contact:${c.id}`,
    kind: "contact",
    name: c.name,
    subtitle: projectName,
    contactId: c.id,
    contactName: c.name,
    projectId,
    projectName,
  };
}

function mergeSearchResults(contacts: ContactRow[], preview: SearchPreviewRow[]): ResultRow[] {
  const rows = contacts.map(mapContactRow);
  const coveredProjectIds = new Set(rows.map((r) => r.projectId).filter(Boolean));

  for (const item of preview) {
    if (item.type === "contact") {
      if (rows.some((r) => r.contactId === item.id)) continue;
      rows.push({
        key: `contact:${item.id}`,
        kind: "contact",
        name: item.name,
        subtitle: null,
        contactId: item.id,
        contactName: item.name,
        projectId: null,
        projectName: null,
      });
      continue;
    }
    if (coveredProjectIds.has(item.id) || rows.some((r) => r.projectId === item.id)) continue;
    rows.push({
      key: `project:${item.id}`,
      kind: "project",
      name: item.name,
      subtitle: null,
      contactId: null,
      contactName: null,
      projectId: item.id,
      projectName: item.name,
    });
  }

  return rows.slice(0, 8);
}

export default function ClientProjectStep({ draft, onUpdate }: Props) {
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

  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length >= 2;
  const displayResults = isSearching
    ? results
    : trimmedQuery.length === 1
      ? defaultProjects.filter((row) => row.name.toLowerCase().includes(trimmedQuery.toLowerCase()))
      : defaultProjects;

  const hasSelection = canAdvanceFromClientStep(draft);

  const applyManualClient = async () => {
    const name = manualName.trim();
    if (name.length < 2) return;
    setSelectBusy(true);
    try {
      await onUpdate({
        contactId: null,
        contactName: name,
      });
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
  const showEmpty =
    !listLoading &&
    !loading &&
    isSearching &&
    displayResults.length === 0 &&
    !searchError;
  const showProjectsEmpty =
    !listLoading && !isSearching && trimmedQuery.length === 0 && defaultProjects.length === 0 && !searchError;

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-y-contain p-4">
      <div>
        <h3 className="text-base font-black">{t("workspaceWidgets.fieldCopilot.clientTitle")}</h3>
        <p className="text-sm text-[color:var(--foreground-muted)]">
          {t("workspaceWidgets.fieldCopilot.clientSubtitle")}
        </p>
      </div>

      <div className="flex gap-2" role="group" aria-label={t("workspaceWidgets.fieldCopilot.clientTitle")}>
        <button
          type="button"
          onClick={() => setMode("list")}
          className={`min-h-[40px] flex-1 rounded-xl border px-3 text-sm font-bold ${
            mode === "list" ? "border-amber-500 bg-amber-500/10" : "border-[color:var(--border-main)]"
          }`}
        >
          {t("workspaceWidgets.fieldCopilot.clientModeList")}
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`min-h-[40px] flex-1 rounded-xl border px-3 text-sm font-bold ${
            mode === "manual" ? "border-amber-500 bg-amber-500/10" : "border-[color:var(--border-main)]"
          }`}
        >
          {t("workspaceWidgets.fieldCopilot.clientModeManual")}
        </button>
      </div>

      {mode === "manual" ? (
        <div className="space-y-3 rounded-xl border border-[color:var(--border-main)] p-3">
          <label className="block text-sm font-bold">{t("workspaceWidgets.fieldCopilot.clientManualTitle")}</label>
          <input
            type="text"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            onBlur={() => void applyManualClient()}
            placeholder={t("workspaceWidgets.fieldCopilot.clientManualPlaceholder")}
            className="w-full min-h-[44px] rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2"
          />
          <p className="text-xs text-[color:var(--foreground-muted)]">
            {t("workspaceWidgets.fieldCopilot.clientManualHint")}
          </p>
          <p className="text-xs font-bold text-[color:var(--foreground-muted)]">
            {t("workspaceWidgets.fieldCopilot.clientManualProject")}
          </p>
          <ul className="max-h-[200px] space-y-2 overflow-y-auto">
            {defaultProjects.map((row) => {
              const selected = draft?.projectId === row.projectId;
              return (
                <li key={row.key}>
                  <button
                    type="button"
                    disabled={selectBusy || manualName.trim().length < 2}
                    onClick={() => void selectManualProject(row)}
                    className={`w-full rounded-lg border p-2 text-start text-sm font-bold disabled:opacity-40 ${
                      selected ? "border-amber-500 bg-amber-500/10" : "border-[color:var(--border-main)]"
                    }`}
                  >
                    {row.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {mode === "list" ? (
        <>
      <div className="relative">
        <Search className="pointer-events-none absolute inset-inline-start-3 top-1/2 -translate-y-1/2 text-[color:var(--foreground-muted)]" size={18} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("workspaceWidgets.fieldCopilot.searchClient")}
          className="w-full min-h-[44px] rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] py-3 ps-11 pe-3"
        />
      </div>

      {listLoading || loading ? (
        <p className="text-xs text-[color:var(--foreground-muted)]">
          {t("workspaceWidgets.fieldCopilot.projectsLoading")}
        </p>
      ) : null}
      {searchError ? (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
          {searchError}
        </p>
      ) : null}
      {showEmpty ? (
        <p className="text-sm text-[color:var(--foreground-muted)]">
          {t("workspaceWidgets.fieldCopilot.searchNoResults")}
        </p>
      ) : null}
      {showProjectsEmpty ? (
        <p className="text-sm text-[color:var(--foreground-muted)]">
          {t("workspaceWidgets.fieldCopilot.projectsEmpty")}
        </p>
      ) : null}

      {!listLoading && displayResults.length > 0 ? (
        <p className="text-xs font-bold text-[color:var(--foreground-muted)]">
          {isSearching
            ? t("workspaceWidgets.fieldCopilot.searchResults")
            : t("workspaceWidgets.fieldCopilot.projectsList")}
        </p>
      ) : null}

      <ul className="space-y-2">
        {displayResults.map((row) => {
          const selected =
            (row.contactId && draft?.contactId === row.contactId) ||
            (row.projectId && draft?.projectId === row.projectId);
          return (
            <li key={row.key}>
              <button
                type="button"
                disabled={selectBusy}
                onClick={() => void selectRow(row)}
                className={`w-full rounded-xl border p-3 text-start disabled:opacity-60 ${
                  selected ? "border-amber-500 bg-amber-500/10" : "border-[color:var(--border-main)]"
                }`}
              >
                <p className="font-bold">{row.name}</p>
                {row.subtitle ? (
                  <p className="text-xs text-[color:var(--foreground-muted)]">{row.subtitle}</p>
                ) : row.kind === "project" ? (
                  <p className="text-xs text-[color:var(--foreground-muted)]">
                    {t("workspaceWidgets.fieldCopilot.projectResult")}
                  </p>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
        </>
      ) : null}

      {hasSelection ? (
        <p className="rounded-lg bg-[color:var(--surface-soft)] p-3 text-sm">
          {t("workspaceWidgets.fieldCopilot.selectedClient")}:{" "}
          <strong>{draft?.contactName ?? draft?.projectName}</strong>
          {draft?.contactName && draft?.projectName ? ` · ${draft.projectName}` : ""}
        </p>
      ) : null}
    </div>
  );
}
