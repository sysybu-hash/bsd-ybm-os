"use client";

import React, { useState } from "react";
import { Database } from "lucide-react";
import { useKnowledgeVault, type VaultItem } from "@/components/os/KnowledgeVaultProvider";
import KnowledgeVaultPicker from "@/components/os/knowledge-vault/KnowledgeVaultPicker";
import { useI18n } from "@/components/os/system/I18nProvider";

type KnowledgeVaultAttachButtonProps = {
  onSelect: (item: VaultItem) => void;
  className?: string;
  vaultPath?: string;
};

export default function KnowledgeVaultAttachButton({
  onSelect,
  className = "",
  vaultPath,
}: KnowledgeVaultAttachButtonProps) {
  const { t } = useI18n();
  const vault = useKnowledgeVault();
  const [open, setOpen] = useState(false);

  if (!vault.enabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-[10px] font-bold text-[color:var(--foreground-muted)] hover:text-indigo-700 dark:hover:text-indigo-300 ${className}`}
        title={t("knowledgeVault.attachFromVault")}
      >
        <Database size={12} />
        {t("knowledgeVault.attachShort")}
      </button>
      <KnowledgeVaultPicker
        open={open}
        onClose={() => setOpen(false)}
        onSelect={onSelect}
        vaultPath={vaultPath}
      />
    </>
  );
}
