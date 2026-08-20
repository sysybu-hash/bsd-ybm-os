"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { OSNotification } from "@/components/os/NotificationCenter";
import { useKnowledgeVault } from "@/components/os/KnowledgeVaultProvider";
import { useI18n } from "@/components/os/system/I18nProvider";
import { stashPendingScanIntake } from "@/lib/scan/pending-intake";

interface FileDropzoneProps {
  onProcessed: (notification: OSNotification) => void;
  onLatency?: (latency: number) => void;
  /** מפנה לסורק המאוחד במקום /api/analyze ישיר */
  onRouteToScanner?: () => void;
}

interface LegacyDocumentAnalysis {
  amount: number | null;
  vendor: string;
  projectSuggestion: string;
  confidence: number;
  summary: string;
}

const hasFiles = (event: DragEvent) => {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
};

export default function FileDropzone({ onProcessed, onLatency, onRouteToScanner }: FileDropzoneProps) {
  const vault = useKnowledgeVault();
  const { t, locale } = useI18n();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const dragDepthRef = useRef(0);

  const numberLocale = locale === "he" ? "he-IL" : locale === "ru" ? "ru-RU" : "en-GB";

  const formatAmount = useCallback(
    (amount: number | null) => {
      if (typeof amount !== "number") return t("fileDropzone.amountUnknown");
      return new Intl.NumberFormat(numberLocale, {
        style: "currency",
        currency: "ILS",
        maximumFractionDigits: 0,
      }).format(amount);
    },
    [numberLocale, t],
  );

  const processFile = useCallback(
    async (file: File) => {
      if (vault.enabled) {
        void vault.ingestFile(file, "fileDropzone");
      }
      onProcessed({
        id: `ai-analysis-started-${Date.now()}`,
        title: t("fileDropzone.startedTitle"),
        message: t("fileDropzone.startedMessage", { name: file.name }),
        severity: "info",
        createdAt: new Date().toISOString(),
      });

      if (onRouteToScanner) {
        stashPendingScanIntake([file], { autoScan: true, source: "dropzone" });
        onRouteToScanner();
        return;
      }

      setIsProcessing(true);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const startedAt = performance.now();
        const response = await fetch("/api/analyze", {
          method: "POST",
          body: formData,
        });

        onLatency?.(performance.now() - startedAt);

        if (!response.ok) {
          throw new Error("Analysis failed");
        }

        const data = (await response.json()) as {
          success?: boolean;
          analysis?: LegacyDocumentAnalysis;
          notification?: OSNotification;
        };

        if (data.notification) {
          onProcessed(data.notification);
        } else {
          const analysis = data.analysis || {
            amount: null,
            vendor: t("fileDropzone.unknownVendor"),
            projectSuggestion: "",
            confidence: 0,
            summary: t("fileDropzone.noAnalysis"),
          };

          onProcessed({
            id: `smart-expense-${Date.now()}`,
            title: t("fileDropzone.expenseTitle"),
            message: t("fileDropzone.expenseMessage", {
              vendor: analysis.vendor,
              amount: formatAmount(analysis.amount),
              project: analysis.projectSuggestion,
              summary: analysis.summary,
            }),
            severity: analysis.confidence >= 0.7 ? "success" : "warning",
            createdAt: new Date().toISOString(),
            actions: [
              {
                label: t("fileDropzone.confirmExpense"),
                action: "confirmExpense",
                payload: {
                  vendor: analysis.vendor,
                  amount: String(analysis.amount ?? ""),
                  projectSuggestion: analysis.projectSuggestion,
                  fileName: file.name,
                },
              },
              {
                label: t("fileDropzone.viewProject"),
                action: "viewProject",
                payload: { query: analysis.projectSuggestion || "project" },
              },
            ],
          });
        }
      } catch {
        onProcessed({
          id: `document-error-${Date.now()}`,
          title: t("fileDropzone.failedTitle"),
          message: t("fileDropzone.failedMessage", { name: file.name }),
          severity: "critical",
          createdAt: new Date().toISOString(),
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [formatAmount, onLatency, onProcessed, onRouteToScanner, t, vault],
  );

  useEffect(() => {
    const handleDragEnter = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!hasFiles(event)) return;
      dragDepthRef.current += 1;
      setIsDragging(true);
    };

    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
      if (hasFiles(event)) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDragging(false);
      }
    };

    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = 0;
      setIsDragging(false);

      const file = event.dataTransfer?.files?.[0];
      if (file) {
        void processFile(file);
      }
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [processFile]);

  const isActive = isDragging || isProcessing;

  return (
    <div
      className={`fixed inset-0 z-[9999] transition-opacity duration-150 ${
        isActive ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!isActive}
    >
      <div className="absolute inset-0 bg-blue-950/55 backdrop-blur-md" />
      <div className="absolute inset-6 flex items-center justify-center rounded-[2rem] border-4 border-dashed border-blue-300/80 bg-blue-500/20 text-center shadow-[0_0_90px_rgba(59,130,246,0.35)]">
        <div className="rounded-3xl border border-blue-200/30 bg-slate-950/80 px-10 py-8 text-white shadow-2xl backdrop-blur-2xl">
          <p className="text-sm uppercase tracking-[0.28em] text-blue-100/80">
            {isProcessing ? t("fileDropzone.overlayEyebrowBusy") : t("fileDropzone.overlayEyebrow")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold">
            {isProcessing ? t("fileDropzone.overlayTitleBusy") : t("fileDropzone.overlayTitle")}
          </h2>
          <p className="mt-3 max-w-md text-sm text-blue-50/80">{t("fileDropzone.overlayBody")}</p>
        </div>
      </div>
    </div>
  );
}
