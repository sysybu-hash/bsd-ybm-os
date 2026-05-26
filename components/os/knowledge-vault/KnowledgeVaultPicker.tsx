"use client";

import React, { useEffect, useState } from "react";
import { FolderOpen, Loader2, X } from "lucide-react";
import { useKnowledgeVault, type VaultItem } from "@/components/os/KnowledgeVaultProvider";
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
  const vault = useKnowledgeVault();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open && vault.enabled) void vault.refresh(vaultPath);
  }, [open, vault, vault.enabled, vault.refresh, vaultPath]);

  if (!open || !vault.enabled) return null;

  const filtered = vault.items.filter((i) =>
    !search.trim() ? true : i.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

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
        {vault.loading ? (
          <VaultPickerLoading label={t("knowledgeVault.loading")} />
        ) : filtered.length === 0 ? (
          <p className="text-center text-xs text-[color:var(--foreground-muted)]">{t("knowledgeVault.empty")}</p>
        ) : (
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {filtered.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(item);
                    onClose();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-right text-xs hover:bg-[color:var(--surface-soft)]"
                >
                  <FolderOpen size={14} className="shrink-0 text-indigo-400" />
                  <span className="min-w-0 flex-1 truncate font-semibold">{item.name}</span>
                  {item.decodeStatus ? (
                    <span className="shrink-0 text-[10px] text-[color:var(--foreground-muted)]">
                      {item.decodeStatus}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
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
