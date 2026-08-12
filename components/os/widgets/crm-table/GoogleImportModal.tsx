"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import { CrmOverlayPortal } from "./CrmOverlayPortal";
import { OsButton, OsIconButton } from "@/components/os/ui";
import type { GoogleContactPreviewRow } from "./crm-table-api";

type GoogleImportModalProps = {
  onClose: () => void;
  onImported: () => void;
  t: (key: string, vars?: Record<string, string>) => string;
  fetchPreview: () => Promise<{
    ok: boolean;
    contacts?: GoogleContactPreviewRow[];
    error?: string;
    code?: string;
    reauthUrl?: string;
  }>;
  runImport: (payload: { importAll?: boolean; ids?: string[] }) => Promise<{
    ok: boolean;
    message?: string;
    error?: string;
    code?: string;
    reauthUrl?: string;
  }>;
};

export function GoogleImportModal({
  onClose,
  onImported,
  t,
  fetchPreview,
  runImport,
}: GoogleImportModalProps) {
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [contacts, setContacts] = useState<GoogleContactPreviewRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [reauthUrl, setReauthUrl] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    setReauthUrl(null);
    try {
      const result = await fetchPreview();
      if (!result.ok) {
        setError(result.error ?? t("workspaceWidgets.crmTable.googleImportFailed"));
        if (result.reauthUrl) setReauthUrl(result.reauthUrl);
        setContacts([]);
        setSelected(new Set());
        return;
      }
      const rows = result.contacts ?? [];
      setContacts(rows);
      const importable = rows.filter((c) => !c.alreadyExists);
      setSelected(new Set(importable.map((c) => c.id)));
    } finally {
      setLoading(false);
    }
  }, [fetchPreview, t]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const importableIds = useMemo(
    () => contacts.filter((c) => !c.alreadyExists).map((c) => c.id),
    [contacts],
  );

  const allSelected =
    importableIds.length > 0 && importableIds.every((id) => selected.has(id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(importableIds));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = async () => {
    if (importing || selected.size === 0) return;
    setImporting(true);
    setError(null);
    try {
      const result = await runImport({
        importAll: selected.size === importableIds.length,
        ids: [...selected],
      });
      if (!result.ok) {
        setError(result.error ?? t("workspaceWidgets.crmTable.googleImportFailed"));
        if (result.reauthUrl) setReauthUrl(result.reauthUrl);
        return;
      }
      onImported();
      onClose();
    } finally {
      setImporting(false);
    }
  };

  return (
    <CrmOverlayPortal>
      <div className="w-full max-w-2xl shrink-0 bg-[color:var(--surface-card)] border border-[color:var(--border-main)] rounded-[2.5rem] p-8 shadow-2xl my-auto max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-6 shrink-0">
          <h3 className="text-xl font-bold text-[color:var(--foreground-main)] flex items-center gap-3">
            <Download className="text-[color:var(--accent)]" size={24} aria-hidden />
            {t("workspaceWidgets.crmTable.importGooglePreviewTitle")}
          </h3>
          <OsIconButton label={t("common.close")} onClick={onClose} size="sm">
            <X size={20} aria-hidden />
          </OsIconButton>
        </div>

        {loading ? (
          <p className="text-sm text-[color:var(--foreground-muted)] py-8 text-center">
            {t("workspaceWidgets.crmTable.importGooglePreviewLoading")}
          </p>
        ) : error ? (
          <div className="space-y-4 py-4">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            {reauthUrl ? (
              <OsButton variant="primary" onClick={() => window.location.assign(reauthUrl)}>
                {t("workspaceWidgets.crmTable.importGoogleReconnect")}
              </OsButton>
            ) : (
              <OsButton variant="secondary" onClick={() => void loadPreview()} icon={<RefreshCw size={16} aria-hidden />}>
                {t("workspaceWidgets.crmTable.retry")}
              </OsButton>
            )}
          </div>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-[color:var(--foreground-muted)] py-8 text-center">
            {t("workspaceWidgets.crmTable.importGooglePreviewEmpty")}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3 shrink-0">
              <label className="flex items-center gap-2 text-xs font-bold text-[color:var(--foreground-muted)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded border-[color:var(--border-main)]"
                />
                {t("workspaceWidgets.crmTable.importGoogleSelectAll")}
              </label>
              <span className="text-xs text-[color:var(--foreground-muted)]">
                {t("workspaceWidgets.crmTable.importGoogleSelectedCount", {
                  count: String(selected.size),
                })}
              </span>
            </div>

            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar border border-[color:var(--border-main)] rounded-xl divide-y divide-[color:var(--border-main)]">
              {contacts.map((c) => {
                const disabled = c.alreadyExists;
                return (
                  <label
                    key={c.id}
                    className={`flex items-start gap-3 px-4 py-3 text-sm ${
                      disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-[color:var(--surface-soft)]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      disabled={disabled}
                      onChange={() => toggleOne(c.id)}
                      className="mt-1 rounded border-[color:var(--border-main)]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold truncate">{c.name}</div>
                      <div className="text-xs text-[color:var(--foreground-muted)] truncate">
                        {c.email || t("workspaceWidgets.crmTable.noEmail")}
                        {c.phone ? ` · ${c.phone}` : ""}
                      </div>
                      {c.alreadyExists ? (
                        <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                          {t("workspaceWidgets.crmTable.importGoogleAlreadyExists")}
                        </div>
                      ) : null}
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="flex gap-2 mt-6 shrink-0">
              <OsButton variant="secondary" onClick={onClose} className="flex-1 justify-center">
                {t("workspaceWidgets.confirm.cancel")}
              </OsButton>
              <OsButton
                variant="primary"
                onClick={() => void handleImport()}
                loading={importing}
                disabled={selected.size === 0}
                className="flex-1 justify-center"
              >
                {t("workspaceWidgets.crmTable.importGoogleConfirm", { count: String(selected.size) })}
              </OsButton>
            </div>
          </>
        )}
      </div>
    </CrmOverlayPortal>
  );
}
