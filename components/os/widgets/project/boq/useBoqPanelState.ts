"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { TakeoffMeasurement } from "@/components/os/widgets/project/TakeoffModule";

export type BoqLine = {
  id: string;
  description: string;
  unit: string | null;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number;
  isWorkDone: boolean;
  progressCoefficient: number | null;
  isSectionSubtotal: boolean;
};

export type BoqSubTab = "quote" | "boq" | "bills" | "milestones";

/** נתונים ופעולות של פאנל כתב הכמויות — טעינה, ייבוא/ייצוא, עריכת שורות, Takeoff וגאנט */
export function useBoqPanelState(apiBase: string) {
  const { t } = useI18n();
  const [subTab, setSubTab] = useState<BoqSubTab>("boq");
  const [lines, setLines] = useState<BoqLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showTakeoff, setShowTakeoff] = useState(false);
  const [savingTakeoff, setSavingTakeoff] = useState(false);
  const [generatingGantt, setGeneratingGantt] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${apiBase}/boq`, { credentials: "include" });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        lines?: BoqLine[];
      };
      if (!res.ok) {
        const msg =
          typeof json.error === "string" && json.error.trim()
            ? json.error
            : t("projectDashboard.errors.boqLoad");
        throw new Error(msg);
      }
      setLines(Array.isArray(json.lines) ? json.lines : []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("projectDashboard.errors.boqLoad");
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [apiBase, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onImport = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const preview = await fetch(`${apiBase}/import/excel`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    const prev = await preview.json();
    if (!preview.ok) {
      toast.error(prev.error ?? t("workspaceWidgets.projectBoq.importFailed"));
      return;
    }
    if (!confirm(`לייבא ${prev.lineCount} שורות ו-${prev.billCount} חשבונות?`)) return;
    fd.append("confirm", "true");
    const res = await fetch(`${apiBase}/import/excel`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? t("workspaceWidgets.projectBoq.importFailed"));
      return;
    }
    toast.success(t("workspaceWidgets.projectBoq.importedLines").replace("{n}", String(json.linesImported)));
    await load();
  };

  const exportExcel = (type: string) => {
    window.open(`${apiBase}/export/excel?type=${type}`, "_blank");
  };

  const patchLine = async (id: string, patch: Partial<BoqLine>) => {
    const res = await fetch(`${apiBase}/boq`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (!res.ok) {
      toast.error(t("workspaceWidgets.projectBoq.rowUpdateFailed"));
      return;
    }
    await load();
  };

  /** עורך שדה תא (תיאור/כמות/מחיר) ב-blur — רק אם הערך השתנה */
  const editCell = (l: BoqLine, field: "description" | "quantity" | "unitPrice", raw: string) => {
    if (field === "description") {
      const v = raw.trim();
      if (v && v !== l.description) void patchLine(l.id, { description: v });
      return;
    }
    const v = raw.trim() === "" ? null : Number(raw);
    if (v == null || !Number.isFinite(v) || v < 0) return;
    if (v !== l[field]) void patchLine(l.id, { [field]: v });
  };

  const deleteLine = async (id: string) => {
    const res = await fetch(`${apiBase}/boq?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      toast.error(t("workspaceWidgets.projectBoq.deleteFailed"));
      return;
    }
    toast.success(t("workspaceWidgets.projectBoq.rowDeleted"));
    await load();
  };

  const clearAllLines = async () => {
    setConfirmClear(false);
    const res = await fetch(`${apiBase}/boq?clearAll=true`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      toast.error(t("workspaceWidgets.projectBoq.deleteFailed"));
      return;
    }
    toast.success(t("workspaceWidgets.projectBoq.allCleared"));
    await load();
  };

  const saveTakeoffMeasurement = async (measurement: TakeoffMeasurement) => {
    setSavingTakeoff(true);
    try {
      const res = await fetch(`${apiBase}/boq`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: measurement.description,
          unit: measurement.unit,
          quantity: measurement.area,
          source: "TAKEOFF",
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? t("workspaceWidgets.takeoff.saveFailed"));
      }
      toast.success(t("workspaceWidgets.takeoff.savedToast"));
      await load();
      setShowTakeoff(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("workspaceWidgets.takeoff.saveFailed"));
    } finally {
      setSavingTakeoff(false);
    }
  };

  const generateGantt = async () => {
    if (generatingGantt) return; // guard against rapid double-submit before re-render
    setGeneratingGantt(true);
    const toastId = toast.loading(t("workspaceWidgets.ganttAgent.analyzing"));
    try {
      const res = await fetch(`${apiBase}/generate-gantt`, {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        created?: number;
        calendar?: { connected: boolean; synced: number };
      };
      if (!res.ok) {
        throw new Error(json.error ?? t("workspaceWidgets.ganttAgent.failed"));
      }
      const baseMsg = t("workspaceWidgets.ganttAgent.success").replace(
        "{n}",
        String(json.created ?? 0),
      );
      const calMsg = json.calendar?.connected
        ? t("workspaceWidgets.ganttAgent.calendarSynced").replace(
            "{m}",
            String(json.calendar.synced ?? 0),
          )
        : t("workspaceWidgets.ganttAgent.calendarNotConnected");
      toast.success(`${baseMsg} ${calMsg}`, { id: toastId });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("workspaceWidgets.ganttAgent.failed"), {
        id: toastId,
      });
    } finally {
      setGeneratingGantt(false);
    }
  };

  return {
    t,
    subTab,
    setSubTab,
    lines,
    loading,
    loadError,
    showTakeoff,
    setShowTakeoff,
    savingTakeoff,
    generatingGantt,
    confirmClear,
    setConfirmClear,
    load,
    onImport,
    exportExcel,
    patchLine,
    editCell,
    deleteLine,
    clearAllLines,
    saveTakeoffMeasurement,
    generateGantt,
  };
}

export type BoqPanelState = ReturnType<typeof useBoqPanelState>;
