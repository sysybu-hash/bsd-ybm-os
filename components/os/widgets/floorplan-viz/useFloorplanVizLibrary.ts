"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { fileFromDataUrl } from "@/components/os/widgets/floorplan-viz/plan-source";
import type { FloorplanVizResult } from "@/lib/projects/floorplan-viz";
import type { FloorplanLayout, FloorplanRoom } from "@/lib/projects/floorplan-layout";

type TFn = (key: string, vars?: Record<string, string>) => string;

/**
 * The saved runs: open one, delete it, rename it, save the room list checked
 * against its sheet. Split out of useFloorplanVizRun, which keeps the run in
 * hand and its production.
 */
export function useFloorplanVizLibrary({
  t,
  result,
  setResult,
  setFile,
  setLoading,
  setError,
  applyResult,
  refreshRuns,
  titleDraft,
}: {
  t: TFn;
  result: FloorplanVizResult | null;
  setResult: Dispatch<SetStateAction<FloorplanVizResult | null>>;
  setFile: Dispatch<SetStateAction<File | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  applyResult: (incoming: FloorplanVizResult) => void;
  refreshRuns: () => Promise<void>;
  titleDraft: string;
}) {
  const openRun = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/projects/visualize-floorplan/${encodeURIComponent(id)}`, {
          credentials: "include",
        });
        const json = (await res.json()) as Record<string, unknown>;
        if (!res.ok) {
          toast.error(typeof json.error === "string" ? json.error : t("workspaceWidgets.floorplanViz.loadFailed"));
          return;
        }
        const incoming = json as unknown as FloorplanVizResult & { sourceFileName?: string };
        applyResult(incoming);
        if (incoming.planBase64 && incoming.planMimeType) {
          const incomingPdf =
            incoming.planMimeType === "application/pdf" || incoming.planBase64.startsWith("JVBERi");
          setFile((prev) => {
            if (
              !incomingPdf &&
              prev &&
              (prev.type === "application/pdf" || /\.pdf$/i.test(prev.name))
            ) {
              return prev;
            }
            return fileFromDataUrl(
              `data:${incoming.planMimeType};base64,${incoming.planBase64}`,
              incoming.sourceFileName || incoming.title || (incomingPdf ? "plan.pdf" : "plan.jpg"),
            );
          });
        }
      } catch {
        toast.error(t("workspaceWidgets.floorplanViz.loadFailed"));
      } finally {
        setLoading(false);
      }
    },
    [applyResult, setError, setFile, setLoading, t],
  );

  const deleteRun = useCallback(
    async (id: string) => {
      if (!window.confirm(t("workspaceWidgets.floorplanViz.deleteRunConfirm"))) return;
      const res = await fetch(`/api/projects/visualize-floorplan/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        toast.error(t("workspaceWidgets.floorplanViz.deleteFailed"));
        return;
      }
      if (result?.runId === id) {
        setResult(null);
        setFile(null);
      }
      toast.success(t("workspaceWidgets.floorplanViz.deleted"));
      void refreshRuns();
    },
    [refreshRuns, result?.runId, setFile, setResult, t],
  );

  const renameRun = useCallback(async () => {
    if (!result?.runId) return;
    const title = titleDraft.trim();
    if (!title || title === result.title) return;
    const res = await fetch(`/api/projects/visualize-floorplan/${encodeURIComponent(result.runId)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      toast.error(t("workspaceWidgets.floorplanViz.renameFailed"));
      return;
    }
    setResult({ ...result, title });
    void refreshRuns();
  }, [refreshRuns, result, setResult, t, titleDraft]);

  /** Save the room list a person checked against the sheet; the booklet builds from it. */
  const saveRooms = useCallback(
    async (rooms: FloorplanRoom[]): Promise<boolean> => {
      if (!result?.runId) return false;
      const res = await fetch(`/api/projects/visualize-floorplan/${encodeURIComponent(result.runId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rooms }),
      });
      const json = (await res.json().catch(() => ({}))) as { layout?: FloorplanLayout; error?: string };
      if (!res.ok || !json.layout) {
        toast.error(typeof json.error === "string" ? json.error : t("workspaceWidgets.floorplanViz.roomsSaveFailed"));
        return false;
      }
      setResult({ ...result, layout: json.layout });
      toast.success(t("workspaceWidgets.floorplanViz.roomsSaved"));
      return true;
    },
    [result, setResult, t],
  );


  return { openRun, deleteRun, renameRun, saveRooms };
}
