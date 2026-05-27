"use client";

import { useCallback, useState } from "react";
import type { FieldCopilotDraft } from "@/lib/validation/schemas/field-copilot";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";
import type { FieldCopilotHandoffTarget } from "@/lib/field-copilot/handoff";

async function parseJsonRes<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

/** Fast base64 using FileReader — avoids slow byte-by-byte btoa loop */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Compress photos to max 1920px / 85% quality before upload */
async function compressPhoto(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1920;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const scale = Math.min(1, MAX / Math.max(w, h));
      const cw = Math.round(w * scale);
      const ch = Math.round(h * scale);
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, cw, ch);
      canvas.toBlob(
        (blob) => resolve(blob ?? file),
        "image/jpeg",
        0.85,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

export function useFieldCopilotSession(initialSessionId?: string) {
  const [draft, setDraft] = useState<FieldCopilotDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [driveNotice, setDriveNotice] = useState<"saved" | "failed" | null>(null);

  const loadSession = useCallback(async (sessionId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await parseJsonRes<{ draft: FieldCopilotDraft }>(
        await fetch(`/api/field-copilot/session?sessionId=${encodeURIComponent(sessionId)}`, {
          credentials: "include",
        }),
      );
      setDraft(data.draft);
      return data.draft;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createSession = useCallback(
    async (input?: {
      contactId?: string;
      contactName?: string;
      projectId?: string;
      projectName?: string;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const data = await parseJsonRes<{ draft: FieldCopilotDraft }>(
          await fetch("/api/field-copilot/session", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input ?? {}),
          }),
        );
        setDraft(data.draft);
        return data.draft;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        void import("@/lib/analytics/workspace-events").then(({ trackSessionCreateFailed }) => {
          trackSessionCreateFailed(msg.slice(0, 120));
        });
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const patchSession = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!draft?.id) throw new Error("אין סשן פעיל");
      setLoading(true);
      setError(null);
      try {
        const data = await parseJsonRes<{ draft: FieldCopilotDraft }>(
          await fetch("/api/field-copilot/session", {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: draft.id, ...patch }),
          }),
        );
        setDraft(data.draft);
        return data.draft;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [draft?.id],
  );

  const uploadAsset = useCallback(
    async (file: Blob, kind: "photo" | "video" | "keyframe", mimeType: string) => {
      if (!draft?.id) throw new Error("אין סשן פעיל");

      // Compress photos before encoding
      const toEncode = kind === "photo" && file instanceof File
        ? await compressPhoto(file)
        : file;

      // Fast base64 via FileReader — avoids O(n) btoa loop
      const dataBase64 = await blobToBase64(toEncode);

      const data = await parseJsonRes<{
        asset: { id: string; kind: string; mimeType: string };
        driveSaved?: boolean;
        driveWarning?: string;
      }>(
        await fetch("/api/field-copilot/assets", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: draft.id, kind, mimeType, dataBase64 }),
        }),
      );

      if (data.driveSaved === true) setDriveNotice("saved");
      else if (kind === "photo" || kind === "video") setDriveNotice("failed");

      // Optimistic update — avoid full loadSession round-trip
      setDraft((prev) => {
        if (!prev) return prev;
        if (kind === "photo" || kind === "keyframe") {
          return {
            ...prev,
            capture: {
              ...prev.capture,
              photoAssetIds: [...prev.capture.photoAssetIds, data.asset.id],
            },
          };
        }
        if (kind === "video") {
          return {
            ...prev,
            capture: { ...prev.capture, videoAssetId: data.asset.id },
          };
        }
        return prev;
      });

      return data.asset;
    },
    [draft?.id],
  );

  const deleteAsset = useCallback(
    async (assetId: string) => {
      if (!draft?.id) throw new Error("אין סשן פעיל");
      setError(null);
      try {
        const data = await parseJsonRes<{ draft: FieldCopilotDraft }>(
          await fetch(
            `/api/field-copilot/assets?assetId=${encodeURIComponent(assetId)}&sessionId=${encodeURIComponent(draft.id)}`,
            { method: "DELETE", credentials: "include" },
          ),
        );
        setDraft(data.draft);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      }
    },
    [draft?.id],
  );

  const analyze = useCallback(
    async (locale: string) => {
      if (!draft?.id) throw new Error("אין סשן פעיל");
      setLoading(true);
      setError(null);
      try {
        const data = await parseJsonRes<{
          extraction: ScanExtractionV5;
          assumptions: string[];
          scopeSummary: string;
        }>(
          await fetch("/api/field-copilot/analyze", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: draft.id, locale }),
          }),
        );
        await loadSession(draft.id);
        return data;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [draft?.id, loadSession],
  );

  const handoff = useCallback(
    async (target: FieldCopilotHandoffTarget) => {
      if (!draft?.id) throw new Error("אין סשן פעיל");
      const data = await parseJsonRes<{ liveData: Record<string, unknown> }>(
        await fetch("/api/field-copilot/handoff", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: draft.id, target }),
        }),
      );
      await loadSession(draft.id);
      return data.liveData;
    },
    [draft?.id, loadSession],
  );

  return {
    draft,
    setDraft,
    loading,
    error,
    loadSession,
    createSession,
    patchSession,
    uploadAsset,
    deleteAsset,
    analyze,
    handoff,
    initialSessionId,
    driveNotice,
    clearDriveNotice: () => setDriveNotice(null),
  };
}
