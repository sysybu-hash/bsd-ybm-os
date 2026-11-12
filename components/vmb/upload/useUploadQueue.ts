"use client";

import { useCallback, useRef, useState } from "react";
import { blobPathnameFor, contentTypeFor, fileKind, safeRelPath, type VmbFileKind } from "@/lib/vmb/files";
import type { PickedFile } from "@/components/vmb/upload/folder-drop";

export type StoredFile = { id: string; relPath: string; kind: string; size: number };

export type QueueItem = {
  key: string;
  relPath: string;
  kind: VmbFileKind;
  size: number;
  status: "queued" | "uploading" | "saving" | "done" | "failed";
  percent: number;
  /** Server code or "generic" when it failed. */
  error?: string;
  file: File;
};

const PARALLEL = 3;
const MULTIPART_FROM = 50 * 1024 * 1024;

/**
 * Uploads a folder's worth of files three at a time: token → Blob → register.
 * Files VMB does not read are counted as skipped and never sent.
 */
/** `access` is the store the server writes to (projectBlobAccess): a token for one store refuses the other's access. */
export function useUploadQueue(projectId: string, access: "private" | "public", onStored: (f: StoredFile) => void) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const running = useRef(0);
  const queue = useRef<QueueItem[]>([]);
  const stored = useRef(onStored);
  stored.current = onStored;

  const patch = useCallback((key: string, p: Partial<QueueItem>) => {
    setItems((all) => all.map((i) => (i.key === key ? { ...i, ...p } : i)));
  }, []);

  const runOne = useCallback(
    async (item: QueueItem) => {
      try {
        patch(item.key, { status: "uploading", percent: 0, error: undefined });
        const { upload } = await import("@vercel/blob/client");
        const blob = await upload(blobPathnameFor(projectId, item.relPath), item.file, {
          access,
          handleUploadUrl: `/api/vmb/projects/${projectId}/upload`,
          contentType: contentTypeFor(item.relPath) ?? undefined,
          multipart: item.size >= MULTIPART_FROM,
          onUploadProgress: ({ percentage }) => patch(item.key, { percent: Math.round(percentage) }),
        });
        patch(item.key, { status: "saving", percent: 100 });
        const res = await fetch(`/api/vmb/projects/${projectId}/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: blob.url, relPath: item.relPath }),
        });
        const data = (await res.json().catch(() => null)) as { file?: StoredFile; code?: string } | null;
        if (!res.ok || !data?.file) throw new Error(data?.code ?? "generic");
        patch(item.key, { status: "done" });
        stored.current(data.file);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "generic";
        patch(item.key, { status: "failed", error: /^[a-z_]+$/.test(msg) ? msg : "generic" });
      }
    },
    [projectId, access, patch],
  );

  const pump = useCallback(() => {
    while (running.current < PARALLEL && queue.current.length > 0) {
      const next = queue.current.shift()!;
      running.current += 1;
      void runOne(next).finally(() => {
        running.current -= 1;
        pump();
      });
    }
  }, [runOne]);

  const add = useCallback(
    (picked: PickedFile[]) => {
      const fresh: QueueItem[] = [];
      const skip: string[] = [];
      for (const p of picked) {
        const rel = safeRelPath(p.relPath);
        const kind = rel ? fileKind(rel) : null;
        if (!rel || !kind) {
          if (!p.file.name.startsWith(".")) skip.push(p.relPath);
          continue;
        }
        fresh.push({ key: `${rel}:${p.file.size}:${p.file.lastModified}`, relPath: rel, kind, size: p.file.size, status: "queued", percent: 0, file: p.file });
      }
      setSkipped((s) => [...s, ...skip]);
      setItems((all) => [...all.filter((i) => !fresh.some((f) => f.relPath === i.relPath)), ...fresh]);
      queue.current.push(...fresh);
      pump();
    },
    [pump],
  );

  const retry = useCallback(
    (key: string) => {
      const item = items.find((i) => i.key === key);
      if (!item) return;
      patch(key, { status: "queued", percent: 0, error: undefined });
      queue.current.push(item);
      pump();
    },
    [items, patch, pump],
  );

  const clearDone = useCallback(() => setItems((all) => all.filter((i) => i.status !== "done")), []);
  const busy = items.some((i) => i.status === "queued" || i.status === "uploading" || i.status === "saving");
  return { items, skipped, add, retry, clearDone, busy };
}
