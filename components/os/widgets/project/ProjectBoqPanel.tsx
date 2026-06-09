"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Download, Upload, Ruler } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import BoqAgentPanel from "@/components/os/widgets/project/BoqAgentPanel";
import TakeoffModule, { type TakeoffMeasurement } from "@/components/os/widgets/project/TakeoffModule";

type BoqLine = {
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

type SubTab = "quote" | "boq" | "bills" | "milestones";

export default function ProjectBoqPanel({
  projectId,
  apiBase,
  milestonesSection,
}: {
  projectId: string;
  apiBase: string;
  milestonesSection?: React.ReactNode;
}) {
  const { t } = useI18n();
  const [subTab, setSubTab] = useState<SubTab>("boq");
  const [lines, setLines] = useState<BoqLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showTakeoff, setShowTakeoff] = useState(false);
  const [savingTakeoff, setSavingTakeoff] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const subTabs: { id: SubTab; label: string }[] = [
    { id: "quote", label: "הצעת מחיר" },
    { id: "boq", label: "כתב כמויות" },
    { id: "bills", label: "חשבונות חלקיים" },
    { id: "milestones", label: "אבני דרך" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {subTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={`rounded-lg px-2 py-1 text-[10px] font-bold ${
              subTab === t.id
                ? "bg-amber-500/20 text-amber-200"
                : "border border-[color:var(--border-main)] text-[color:var(--foreground-muted)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-xs"
        >
          <Upload size={12} />
          ייבוא Excel
        </button>
        <button
          type="button"
          onClick={() => exportExcel(subTab === "quote" ? "quote" : "account")}
          className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-xs"
        >
          <Download size={12} />
          ייצוא Excel
        </button>
        {subTab === "boq" ? (
          <button
            type="button"
            onClick={() => setShowTakeoff((v) => !v)}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${
              showTakeoff
                ? "border-indigo-500 bg-indigo-500/15 text-indigo-200"
                : "border-[color:var(--border-main)]"
            }`}
          >
            <Ruler size={12} />
            {t("workspaceWidgets.takeoff.openTool")}
          </button>
        ) : null}
      </div>

      {subTab === "boq" && showTakeoff ? (
        <div className="h-[60vh] min-h-[420px]">
          <TakeoffModule onSaveMeasurement={saveTakeoffMeasurement} saving={savingTakeoff} />
        </div>
      ) : null}

      {subTab === "milestones" ? (
        milestonesSection ?? (
          <p className="text-xs text-[color:var(--foreground-muted)]">אין נתוני אבני דרך.</p>
        )
      ) : loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="animate-spin text-amber-500" size={20} />
        </div>
      ) : loadError ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {loadError}
        </p>
      ) : subTab === "boq" ? (
        <>
          <div className="max-h-[40vh] min-h-0 overflow-y-auto rounded-lg border border-[color:var(--border-main)]/50">
            <BoqAgentPanel apiBase={apiBase} onApplied={() => void load()} />
          </div>
          {lines.length === 0 ? (
            <p className="text-xs text-[color:var(--foreground-muted)]">
              {t("projectDashboard.boqEmptyImport")}
            </p>
          ) : (
        <div className="overflow-x-auto rounded-lg border border-[color:var(--border-main)]">
          <table className="w-full min-w-[520px] text-xs">
            <thead>
              <tr className="bg-[color:var(--surface-elevated)] text-[color:var(--foreground-muted)]">
                <th className="p-2 text-start">תיאור</th>
                <th className="p-2">יחידה</th>
                <th className="p-2">כמות</th>
                <th className="p-2">מחיר</th>
                <th className="p-2">סה״כ</th>
                <th className="p-2">בוצע</th>
                <th className="p-2">מקדם</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr
                  key={l.id}
                  className={l.isSectionSubtotal ? "font-bold bg-amber-500/5" : ""}
                >
                  <td className="p-2">{l.description}</td>
                  <td className="p-2 text-center">{l.unit ?? "—"}</td>
                  <td className="p-2 text-center">{l.quantity ?? "—"}</td>
                  <td className="p-2 text-center">{l.unitPrice ?? "—"}</td>
                  <td className="p-2 text-center">{l.lineTotal}</td>
                  <td className="p-2 text-center">
                    <input
                      type="checkbox"
                      checked={l.isWorkDone}
                      onChange={(e) => void patchLine(l.id, { isWorkDone: e.target.checked })}
                    />
                  </td>
                  <td className="p-2 text-center">
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.01}
                      className="w-14 rounded border border-[color:var(--border-main)] bg-transparent px-1"
                      value={l.progressCoefficient ?? ""}
                      onChange={(e) => {
                        const v = e.target.value === "" ? null : Number(e.target.value);
                        void patchLine(l.id, { progressCoefficient: v ?? undefined });
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          )}
        </>
      ) : lines.length === 0 ? (
        <p className="text-xs text-[color:var(--foreground-muted)]">
          {t("projectDashboard.boqEmptyImport")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[color:var(--border-main)]">
          <table className="w-full min-w-[520px] text-xs">
            <thead>
              <tr className="bg-[color:var(--surface-elevated)] text-[color:var(--foreground-muted)]">
                <th className="p-2 text-start">תיאור</th>
                <th className="p-2">יחידה</th>
                <th className="p-2">כמות</th>
                <th className="p-2">מחיר</th>
                <th className="p-2">סה״כ</th>
                <th className="p-2">בוצע</th>
                <th className="p-2">מקדם</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr
                  key={l.id}
                  className={l.isSectionSubtotal ? "font-bold bg-amber-500/5" : ""}
                >
                  <td className="p-2">{l.description}</td>
                  <td className="p-2 text-center">{l.unit ?? "—"}</td>
                  <td className="p-2 text-center">{l.quantity ?? "—"}</td>
                  <td className="p-2 text-center">{l.unitPrice ?? "—"}</td>
                  <td className="p-2 text-center">{l.lineTotal}</td>
                  <td className="p-2 text-center">
                    <input
                      type="checkbox"
                      checked={l.isWorkDone}
                      onChange={(e) => void patchLine(l.id, { isWorkDone: e.target.checked })}
                    />
                  </td>
                  <td className="p-2 text-center">
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.01}
                      className="w-14 rounded border border-[color:var(--border-main)] bg-transparent px-1"
                      value={l.progressCoefficient ?? ""}
                      onChange={(e) => {
                        const v = e.target.value === "" ? null : Number(e.target.value);
                        void patchLine(l.id, { progressCoefficient: v ?? undefined });
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
