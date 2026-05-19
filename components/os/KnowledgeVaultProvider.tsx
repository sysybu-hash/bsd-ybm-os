"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type VaultItem = {
  id: string;
  driveFileId: string;
  name: string;
  mimeType: string;
  vaultPath: string | null;
  decodeStatus: string | null;
  parsedSummary: unknown;
  webViewLink: string | null;
  modifiedTime: string | null;
};

type KnowledgeVaultContextValue = {
  enabled: boolean;
  loading: boolean;
  items: VaultItem[];
  refresh: (vaultPath?: string) => Promise<void>;
  ingestFile: (file: File, sourceWidgetId?: string) => Promise<{ driveFileId: string } | null>;
};

const KnowledgeVaultContext = createContext<KnowledgeVaultContextValue | null>(null);

export function KnowledgeVaultProvider({
  children,
  knowledgeVaultEnabled = false,
}: {
  children: React.ReactNode;
  knowledgeVaultEnabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<VaultItem[]>([]);

  const refresh = useCallback(
    async (vaultPath?: string) => {
      if (!knowledgeVaultEnabled) return;
      setLoading(true);
      try {
        const qs = vaultPath ? `?vaultPath=${encodeURIComponent(vaultPath)}` : "";
        const res = await fetch(`/api/knowledge-vault/items${qs}`, { credentials: "include", cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { items?: VaultItem[] };
        setItems(data.items ?? []);
      } finally {
        setLoading(false);
      }
    },
    [knowledgeVaultEnabled],
  );

  useEffect(() => {
    if (knowledgeVaultEnabled) void refresh();
  }, [knowledgeVaultEnabled, refresh]);

  const ingestFile = useCallback(
    async (file: File, sourceWidgetId?: string) => {
      if (!knowledgeVaultEnabled) return null;
      const form = new FormData();
      form.append("file", file);
      if (sourceWidgetId) form.append("sourceWidgetId", sourceWidgetId);
      const res = await fetch("/api/knowledge-vault/ingest", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { driveFileId?: string };
      void refresh();
      return data.driveFileId ? { driveFileId: data.driveFileId } : null;
    },
    [knowledgeVaultEnabled, refresh],
  );

  const value = useMemo(
    () => ({
      enabled: knowledgeVaultEnabled,
      loading,
      items,
      refresh,
      ingestFile,
    }),
    [knowledgeVaultEnabled, loading, items, refresh, ingestFile],
  );

  return <KnowledgeVaultContext.Provider value={value}>{children}</KnowledgeVaultContext.Provider>;
}

export function useKnowledgeVault() {
  const ctx = useContext(KnowledgeVaultContext);
  return (
    ctx ?? {
      enabled: false,
      loading: false,
      items: [],
      refresh: async () => undefined,
      ingestFile: async () => null,
    }
  );
}
