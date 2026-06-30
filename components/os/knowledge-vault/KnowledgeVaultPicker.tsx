"use client";

import React, { useEffect, useMemo, useState } from "react";
import { FolderOpen, Loader2, Sparkles, X } from "lucide-react";
import {
  useKnowledgeVault,
  type VaultItem,
  type VaultSearchHit,
} from "@/components/os/KnowledgeVaultProvider";
import { useI18n } from "@/components/os/system/I18nProvider";

type KnowledgeVaultPickerProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (item: VaultItem) => void;
  vaultPath?: string;
};

export default function KnowledgeVaultPicker({
  open,
  onClose,
  onSelect,
  vaultPath,
}: KnowledgeVaultPickerProps) {
  const { t } = useI18n();
  const {
    items,
    semanticHits,
    semanticSearching,
    loading,
    enabled,
    refresh,
    clearSemanticSearch,
    semanticSearch,
  } = useKnowledgeVault();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open && enabled) void refresh(vaultPath);
  }, [open, enabled, refresh, vaultPath]);

  useEffect(() => {
    if (!open) {
      clearSemanticSearch();
      return;
    }
    const q = search.trim();
    if (q.length < 3) {
      clearSemanticSearch();
      return;
    }
    const timer = window.setTimeout(() => {
      void semanticSearch(q);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [open, search, clearSemanticSearch, semanticSearch]);

  const semanticByFileId = useMemo(() => {
    const map = new Map<string, VaultSearchHit>();
    for (const hit of semanticHits) {
      if (!map.has(hit.driveFileId)) map.set(hit.driveFileId, hit);
    }
    return map;
  }, [semanticHits]);

  const displayItems = useMemo((): VaultItem[] => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    if (semanticHits.length > 0) {
      const ids = new Set(semanticHits.map((h) => h.driveFileId));
      const fromVault = items.filter((i) => ids.has(i.driveFileId));
      if (fromVault.length > 0) return fromVault;
    }
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [search, items, semanticHits]);

  if (!open || !enabled) return null;

  const useSemantic = search.trim().length >= 3;

  return (
    <>
      <button type="button" className="fixed inset-0 z-[1249] bg-black/50" aria-label="close" onClick={onClose} />
      <VaultPickerDialog title={t("knowledgeVault.pickerTitle")} onClose={onClose}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("knowledgeVault.searchPlaceholder")}
          className="mb-3 w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2 text-sm"
        />
        {useSemantic ? (
          <p className="mb-2 flex items-center gap-1 text-[10px] text-[color:var(--win-accent,#6366f1)]">
            <Sparkles size={12} />
            {semanticSearching ? t("knowledgeVault.semanticSearching") : t("knowledgeVault.semanticActive")}
          </p>
        ) : null}
        {loading || (useSemantic && semanticSearching) ? (
          <VaultPickerLoading label={t("knowledgeVault.loading")} />
        ) : displayItems.length === 0 ? (
          <p className="text-center text-xs text-[color:var(--foreground-muted)]">{t("knowledgeVault.empty")}</p>
        ) : (
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {displayItems.map((item) => {
              const hit = semanticByFileId.get(item.driveFileId);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(item);
                      onClose();
                    }}
                    className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2 py-2 text-start text-xs hover:bg-[color:var(--surface-soft)]"
                  >
                    <span className="flex w-full items-center gap-2">
                      <FolderOpen size={14} className="shrink-0 text-indigo-400" />
                      <span className="min-w-0 flex-1 truncate font-semibold">{item.name}</span>
                      {item.decodeStatus ? (
                        <span className="shrink-0 text-[10px] text-[color:var(--foreground-muted)]">
                          {item.decodeStatus}
                        </span>
                      ) : null}
                    </span>
                    {hit?.snippet ? (
                      <span className="line-clamp-2 ps-6 text-[10px] text-[color:var(--foreground-muted)]">
                        {hit.snippet}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </VaultPickerDialog>
    </>
  );
}

function VaultPickerDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed left-1/2 top-1/2 z-[1250] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-4 shadow-xl"
      role="dialog"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-black">{title}</h3>
        <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-[color:var(--surface-soft)]">
          <X size={16} />
        </button>
      </div>
      {children}
    </div>
  );
}

function VaultPickerLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-xs text-[color:var(--foreground-muted)]">
      <Loader2 size={16} className="animate-spin" />
      {label}
    </div>
  );
}
