"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { buildScanFileAcceptAttribute } from "@/lib/scan-mime";
import type { Source } from "./types";

type Args = {
  sources: Source[];
  setSources: React.Dispatch<React.SetStateAction<Source[]>>;
  t: (key: string) => string;
};

export function useNotebookSources({ sources, setSources, t }: Args) {
  const [isUploading, setIsUploading] = useState(false);
  const [renameSourceId, setRenameSourceId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileAccept = useMemo(() => buildScanFileAcceptAttribute(), []);

  const uploadSourceFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/notebooklm/extract-source", { method: "POST", body: formData });
    const data = (await res.json()) as { text?: string; error?: string; mimeType?: string };
    if (!res.ok || !data.text) throw new Error(data.error || t("workspaceWidgets.notebookLM.extractFailed"));
    const isPdf = data.mimeType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    setSources((prev) => [
      ...prev,
      { id: Math.random().toString(36).substring(7), name: file.name, content: data.text as string, type: isPdf ? "pdf" : "text" },
    ]);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setIsUploading(true);
    let ok = 0;
    try {
      for (const file of Array.from(files)) {
        try { await uploadSourceFile(file); ok += 1; }
        catch (err) { toast.error(`${file.name}: ${err instanceof Error ? err.message : t("workspaceWidgets.notebookLM.uploadFailed")}`); }
      }
      if (ok > 0) toast.success(`${ok} ${t("workspaceWidgets.notebookLM.uploadSuccess").replace("{count}", String(ok))}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeSource = (id: string) => setSources((prev) => prev.filter((s) => s.id !== id));

  const renameSource = (id: string) => {
    if (sources.find((s) => s.id === id)) setRenameSourceId(id);
  };

  const confirmRenameSource = (name: string) => {
    if (!renameSourceId || !name.trim()) { setRenameSourceId(null); return; }
    setSources((prev) => prev.map((s) => (s.id === renameSourceId ? { ...s, name: name.trim() } : s)));
    setRenameSourceId(null);
  };

  const renameSourceDefault = renameSourceId != null ? (sources.find((s) => s.id === renameSourceId)?.name ?? "") : "";

  return {
    isUploading,
    renameSourceId, setRenameSourceId,
    fileInputRef, fileAccept,
    handleFileUpload, removeSource, renameSource, confirmRenameSource,
    renameSourceDefault,
  };
}
