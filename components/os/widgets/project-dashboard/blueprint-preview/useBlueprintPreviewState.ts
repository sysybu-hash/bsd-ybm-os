"use client";

import { useState } from "react";
import type { BlueprintAnalysis } from "@/lib/projects/blueprint-analysis-schema";
import { downloadBlob, rowsToCsv } from "@/lib/export-file";

type UseBlueprintPreviewParams = {
  data: BlueprintAnalysis;
  projectName?: string;
  enginesUsed?: string[];
  onConfirm: (selected: BlueprintAnalysis) => Promise<void>;
};

/** מצב הבחירה/עריכה של תצוגת פענוח הגרמושקה + פעולות ייצוא ואישור */
export function useBlueprintPreviewState({ data, projectName, enginesUsed, onConfirm }: UseBlueprintPreviewParams) {
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(
    new Set(data.tasks.map((_, i) => i)),
  );
  const [selectedMilestones, setSelectedMilestones] = useState<Set<number>>(
    new Set(data.milestones.map((_, i) => i)),
  );
  const [selectedBoq, setSelectedBoq] = useState<Set<number>>(
    new Set(data.boqLineItems.map((_, i) => i)),
  );
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);

  const [taskEdits, setTaskEdits] = useState(
    data.tasks.map((t) => ({
      name: t.name,
      startDate: t.startDate ?? "",
      endDate: t.endDate ?? "",
      durationDays: t.durationDays != null ? String(t.durationDays) : "",
      tradeCategory: t.tradeCategory ?? "",
    })),
  );
  const [milestoneEdits, setMilestoneEdits] = useState(
    data.milestones.map((m) => ({
      name: m.name,
      percent: m.percent != null ? String(m.percent) : "",
      amount: m.amount != null ? String(m.amount) : "",
      description: m.description ?? "",
    })),
  );
  const [boqEdits, setBoqEdits] = useState(
    data.boqLineItems.map((b) => ({
      description: b.description,
      unit: b.unit ?? "",
      quantity: b.quantity != null ? String(b.quantity) : "",
      unitPrice: b.unitPrice != null ? String(b.unitPrice) : "",
      lineTotal: b.lineTotal != null ? String(b.lineTotal) : "",
      tradeCategory: b.tradeCategory ?? "",
      drawingRef: b.drawingRef ?? "",
      note: b.note ?? "",
      confidence: b.confidence,
    })),
  );

  function buildCurrentAnalysis(): BlueprintAnalysis {
    return {
      tasks: taskEdits.filter((_, i) => selectedTasks.has(i)).map((e) => ({
        name: e.name,
        startDate: e.startDate || undefined,
        endDate: e.endDate || undefined,
        durationDays: e.durationDays ? Number(e.durationDays) : undefined,
        tradeCategory: e.tradeCategory || undefined,
      })),
      milestones: milestoneEdits.filter((_, i) => selectedMilestones.has(i)).map((e) => ({
        name: e.name,
        percent: e.percent ? Number(e.percent) : undefined,
        amount: e.amount ? Number(e.amount) : undefined,
        description: e.description || undefined,
      })),
      boqLineItems: boqEdits.filter((_, i) => selectedBoq.has(i)).map((e) => ({
        description: e.description,
        unit: e.unit || undefined,
        quantity: e.quantity ? Number(e.quantity) : undefined,
        unitPrice: e.unitPrice ? Number(e.unitPrice) : undefined,
        lineTotal: e.lineTotal ? Number(e.lineTotal) : undefined,
        tradeCategory: e.tradeCategory || undefined,
        drawingRef: e.drawingRef || undefined,
        note: e.note || undefined,
        confidence: e.confidence,
      })),
      projectSummary: data.projectSummary,
      totalEstimatedCost: data.totalEstimatedCost,
      requiresReview: false,
    };
  }

  const exportTasksCsv = () => {
    const rows = taskEdits.filter((_, i) => selectedTasks.has(i))
      .map((t) => [t.name, t.tradeCategory, t.durationDays, t.startDate, t.endDate]);
    downloadBlob("blueprint-tasks.csv",
      rowsToCsv([["שם משימה", "קטגוריה", "משך (ימים)", "תחילה", "סיום"], ...rows]),
      "text/csv");
  };

  const exportBoqCsv = () => {
    const rows = boqEdits.filter((_, i) => selectedBoq.has(i))
      .map((b) => [b.description, b.tradeCategory, b.drawingRef, b.unit, b.quantity, b.unitPrice, b.lineTotal, b.note, String(b.confidence ?? "")]);
    downloadBlob("blueprint-boq.csv",
      rowsToCsv([["תיאור", "קטגוריה", "תוכנית", "יחידה", "כמות", "מחיר/יח'", "סה\"כ", "הערות", "ביטחון"], ...rows]),
      "text/csv");
  };

  const exportExcel = async () => {
    setExportingXlsx(true);
    try {
      const res = await fetch("/api/projects/export-blueprint-excel", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysis: buildCurrentAnalysis(),
          projectName,
          enginesUsed,
        }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `blueprint-${projectName ?? "export"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingXlsx(false);
    }
  };

  const exportPdf = async () => {
    setExportingPdf(true);
    try {
      const res = await fetch("/api/projects/export-blueprint-pdf", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis: buildCurrentAnalysis(), projectName }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `blueprint-${projectName ?? "export"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingPdf(false);
    }
  };

  const printDoc = () => setTimeout(() => window.print(), 100);

  const toggleAll = (set: Set<number>, setFn: (s: Set<number>) => void, total: number) => {
    if (set.size === total) setFn(new Set());
    else setFn(new Set(Array.from({ length: total }, (_, i) => i)));
  };

  const handleConfirm = async () => {
    setSaving(true);
    try { await onConfirm(buildCurrentAnalysis()); }
    finally { setSaving(false); }
  };

  // Live BOQ totals
  const boqTotal = boqEdits.reduce((sum, b, i) => {
    if (!selectedBoq.has(i)) return sum;
    const lt = b.lineTotal ? Number(b.lineTotal)
      : (b.quantity && b.unitPrice ? Number(b.quantity) * Number(b.unitPrice) : 0);
    return sum + lt;
  }, 0);

  const totalSelected = selectedTasks.size + selectedMilestones.size + selectedBoq.size;

  return {
    selectedTasks, setSelectedTasks,
    selectedMilestones, setSelectedMilestones,
    selectedBoq, setSelectedBoq,
    saving, exportingPdf, exportingXlsx,
    taskEdits, setTaskEdits,
    milestoneEdits, setMilestoneEdits,
    boqEdits, setBoqEdits,
    exportTasksCsv, exportBoqCsv, exportExcel, exportPdf, printDoc,
    toggleAll, handleConfirm,
    boqTotal, totalSelected,
  };
}

export type BlueprintPreviewState = ReturnType<typeof useBlueprintPreviewState>;
