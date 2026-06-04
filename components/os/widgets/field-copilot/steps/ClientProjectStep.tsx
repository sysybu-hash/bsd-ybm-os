"use client";

import { Search } from "lucide-react";
import type { FieldCopilotDraft } from "@/lib/validation/schemas/field-copilot";
import { useClientProjectStep } from "./useClientProjectStep";

type Props = {
  draft: FieldCopilotDraft | null;
  onUpdate: (patch: Record<string, unknown>) => Promise<void>;
};

export default function ClientProjectStep({ draft, onUpdate }: Props) {
  const {
    t, mode, setMode, manualName, setManualName, query, setQuery,
    defaultProjects, listLoading, loading, searchError, selectBusy,
    isSearching, displayResults, hasSelection, showEmpty, showProjectsEmpty,
    selectRow, applyManualClient, selectManualProject,
  } = useClientProjectStep({ draft, onUpdate });

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto overscroll-y-contain p-4">
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
