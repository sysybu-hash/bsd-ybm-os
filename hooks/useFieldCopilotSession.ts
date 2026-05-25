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
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]!);
      }
      const dataBase64 = btoa(binary);

      const data = await parseJsonRes<{
        asset: { id: string };
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
      await loadSession(draft.id);
      return data.asset;
    },
    [draft?.id, loadSession],
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
    analyze,
    handoff,
    initialSessionId,
    driveNotice,
    clearDriveNotice: () => setDriveNotice(null),
  };
}
