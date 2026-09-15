"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { FloorplanVizImage } from "@/lib/projects/floorplan-layout";
import type { FloorplanVizEditRegion } from "@/lib/projects/floorplan-viz-edit-region";
import type { FloorplanVizResult } from "@/lib/projects/floorplan-viz";
import { floorplanVizViewKey } from "@/lib/projects/floorplan-viz-ids";

type TFn = (key: string, vars?: Record<string, string>) => string;

function stillKey(img: FloorplanVizImage): string {
  return img.id ?? floorplanVizViewKey(img.viewId, img.roomName);
}

/**
 * The five things an operator can ask of one still: edit a marked region,
 * improve the issues they ticked, rescan it against the plan, choose the
 * attempt that ships, and delete one. Each answers with the run's new image
 * list, so the gallery never has to guess what the server kept.
 */
export function useFloorplanVizStills({
  result,
  setResult,
  refreshRuns,
  t,
}: {
  result: FloorplanVizResult | null;
  setResult: (next: FloorplanVizResult) => void;
  refreshRuns: () => Promise<void>;
  t: TFn;
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const editStill = useCallback(
    async (img: FloorplanVizImage, instruction: string, region?: FloorplanVizEditRegion) => {
      if (!result?.runId || !img.id) {
        toast.error(t("workspaceWidgets.floorplanViz.editNeedSave"));
        return;
      }
      const key = stillKey(img);
      setEditingKey(key);
      try {
        const res = await fetch(
          `/api/projects/visualize-floorplan/${encodeURIComponent(result.runId)}/stills/${encodeURIComponent(img.id)}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ instruction, ...(region ? { region } : {}) }),
          },
        );
        const json = (await res.json()) as { image?: FloorplanVizImage; images?: FloorplanVizImage[]; error?: string };
        if (!res.ok || !json.image) {
          toast.error(typeof json.error === "string" ? json.error : t("workspaceWidgets.floorplanViz.editFailed"));
          return;
        }
        setResult({
          ...result,
          images: json.images ?? result.images.map((row) => (row.id === img.id ? json.image! : row)),
        });
        toast.success(t("workspaceWidgets.floorplanViz.edited"));
        void refreshRuns();
      } catch {
        toast.error(t("workspaceWidgets.floorplanViz.editFailed"));
      } finally {
        setEditingKey(null);
      }
    },
    [refreshRuns, result, setResult, t],
  );

  const improveStill = useCallback(
    async (img: FloorplanVizImage, failures: string[] = []) => {
      if (!result?.runId || !img.id) {
        toast.error(t("workspaceWidgets.floorplanViz.editNeedSave"));
        return;
      }
      const key = stillKey(img);
      setEditingKey(key);
      try {
        const res = await fetch(
          `/api/projects/visualize-floorplan/${encodeURIComponent(result.runId)}/stills/${encodeURIComponent(img.id)}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              improve: true,
              ...(failures.length ? { failures } : {}),
            }),
          },
        );
        const json = (await res.json()) as { image?: FloorplanVizImage; images?: FloorplanVizImage[]; error?: string };
        if (!res.ok || !json.image) {
          toast.error(typeof json.error === "string" ? json.error : t("workspaceWidgets.floorplanViz.improveFailed"));
          return;
        }
        setResult({
          ...result,
          images: json.images ?? result.images.map((row) => (row.id === img.id ? json.image! : row)),
        });
        toast.success(t("workspaceWidgets.floorplanViz.improved"));
        void refreshRuns();
      } catch {
        toast.error(t("workspaceWidgets.floorplanViz.improveFailed"));
      } finally {
        setEditingKey(null);
      }
    },
    [refreshRuns, result, setResult, t],
  );

  const rescanStill = useCallback(
    async (img: FloorplanVizImage) => {
      if (!result?.runId || !img.id) {
        toast.error(t("workspaceWidgets.floorplanViz.editNeedSave"));
        return;
      }
      const key = stillKey(img);
      setEditingKey(key);
      try {
        const res = await fetch(
          `/api/projects/visualize-floorplan/${encodeURIComponent(result.runId)}/stills/${encodeURIComponent(img.id)}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rescan: true }),
          },
        );
        const json = (await res.json()) as {
          image?: FloorplanVizImage;
          images?: FloorplanVizImage[];
          auditIssues?: string[];
          error?: string;
        };
        if (!res.ok || !json.image) {
          toast.error(typeof json.error === "string" ? json.error : t("workspaceWidgets.floorplanViz.rescanFailed"));
          return;
        }
        setResult({
          ...result,
          images: json.images ?? result.images.map((row) => (row.id === img.id ? json.image! : row)),
        });
        const n = json.auditIssues?.length ?? json.image.auditIssues?.length ?? 0;
        toast.success(
          n > 0
            ? t("workspaceWidgets.floorplanViz.rescannedWithIssues", { n: String(n) })
            : t("workspaceWidgets.floorplanViz.rescannedClean"),
        );
      } catch {
        toast.error(t("workspaceWidgets.floorplanViz.rescanFailed"));
      } finally {
        setEditingKey(null);
      }
    },
    [result, setResult, t],
  );

  const selectStill = useCallback(
    async (img: FloorplanVizImage) => {
      if (!result?.runId || !img.id) return;
      const res = await fetch(
        `/api/projects/visualize-floorplan/${encodeURIComponent(result.runId)}/stills/${encodeURIComponent(img.id)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selected: true }),
        },
      );
      const json = (await res.json()) as { images?: FloorplanVizImage[]; error?: string };
      if (!res.ok) {
        toast.error(typeof json.error === "string" ? json.error : t("workspaceWidgets.floorplanViz.editFailed"));
        return;
      }
      if (json.images) setResult({ ...result, images: json.images });
      toast.success(t("workspaceWidgets.floorplanViz.chosenAttempt"));
      void refreshRuns();
    },
    [refreshRuns, result, setResult, t],
  );

  const deleteStill = useCallback(
    async (img: FloorplanVizImage) => {
      if (!result?.runId || !img.id) return;
      if (!window.confirm(t("workspaceWidgets.floorplanViz.deleteImageConfirm"))) return;
      const res = await fetch(
        `/api/projects/visualize-floorplan/${encodeURIComponent(result.runId)}/stills/${encodeURIComponent(img.id)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        toast.error(t("workspaceWidgets.floorplanViz.deleteFailed"));
        return;
      }
      setResult({
        ...result,
        images: result.images.filter((row) => row.id !== img.id),
      });
      toast.success(t("workspaceWidgets.floorplanViz.deleted"));
      void refreshRuns();
    },
    [refreshRuns, result, setResult, t],
  );

  return { editingKey, editStill, improveStill, rescanStill, selectStill, deleteStill };
}
