"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { normalizeLocale, type AppLocale } from "@/lib/i18n/config";
import { MARKETING_DEMO_SCAN_API, MARKETING_DEMO_SCAN_MAX_BYTES } from "@/lib/marketing/demo-scan/constants";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";

export type MarketingDemoScanPhase =
  | "idle"
  | "preview"
  | "analyzing"
  | "results"
  | "quota_exceeded";

export type MarketingDemoScanResult = Readonly<{
  extraction: ScanExtractionV5;
  summary: string;
  confidence: "high" | "medium" | "low";
  assumptions: string[];
  registerUrl: string;
}>;

type QuotaState = Readonly<{
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
}>;

type TranslateFn = (key: string, vars?: Record<string, string>) => string;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const base64 = dataUrl.includes(",") ? (dataUrl.split(",")[1] ?? "") : dataUrl;
      if (!base64) {
        reject(new Error("empty_file"));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

export function useMarketingDemoScan(t: TranslateFn, localeInput: string) {
  const locale: AppLocale = normalizeLocale(localeInput);
  const [phase, setPhase] = useState<MarketingDemoScanPhase>("idle");
  const [quota, setQuota] = useState<QuotaState | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileMeta, setFileMeta] = useState<{ name: string; mimeType: string; base64: string } | null>(
    null,
  );
  const [result, setResult] = useState<MarketingDemoScanResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshQuota = useCallback(async () => {
    try {
      const res = await fetch(MARKETING_DEMO_SCAN_API, { credentials: "same-origin" });
      if (!res.ok) return;
      const data = (await res.json()) as QuotaState;
      setQuota(data);
      if (data.remaining <= 0 && phase === "idle") {
        setPhase("quota_exceeded");
      }
    } catch {
      /* ignore */
    }
  }, [phase]);

  useEffect(() => {
    void refreshQuota();
  }, [refreshQuota]);

  const clearPreview = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFileMeta(null);
    setResult(null);
    setErrorMessage(null);
    if (quota && quota.remaining > 0) setPhase("idle");
    else if (quota && quota.remaining <= 0) setPhase("quota_exceeded");
    else setPhase("idle");
  }, [previewUrl, quota]);

  const onFileSelected = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setErrorMessage(null);
      setResult(null);

      if (file.size > MARKETING_DEMO_SCAN_MAX_BYTES) {
        setErrorMessage(t("marketingHome.cinematic.fieldScanFileTooLarge"));
        return;
      }

      const mime = file.type || "image/jpeg";
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
      if (!allowed.includes(mime)) {
        setErrorMessage(t("marketingHome.cinematic.fieldScanFileType"));
        return;
      }

      try {
        const base64 = await readFileAsBase64(file);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        const url = mime.startsWith("image/") ? URL.createObjectURL(file) : null;
        setPreviewUrl(url);
        setFileMeta({ name: file.name, mimeType: mime, base64 });
        setPhase("preview");
      } catch {
        setErrorMessage(t("marketingHome.cinematic.fieldScanError"));
      }
    },
    [previewUrl, t],
  );

  const analyze = useCallback(async () => {
    if (!fileMeta) return;
    if (quota && quota.remaining <= 0) {
      setPhase("quota_exceeded");
      return;
    }

    setPhase("analyzing");
    setErrorMessage(null);

    try {
      const res = await fetch(MARKETING_DEMO_SCAN_API, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          fileName: fileMeta.name,
          mimeType: fileMeta.mimeType,
          imageBase64: fileMeta.base64,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        extraction?: ScanExtractionV5;
        summary?: string;
        confidence?: "high" | "medium" | "low";
        assumptions?: string[];
        registerUrl?: string;
        remaining?: number;
        limit?: number;
        resetAt?: string;
      };

      if (res.status === 429 || data.code === "demo_scan_daily_limit") {
        setPhase("quota_exceeded");
        if (data.resetAt) {
          setQuota({
            limit: data.limit ?? 2,
            used: 2,
            remaining: 0,
            resetAt: data.resetAt,
          });
        }
        toast.error(data.error ?? t("marketingHome.cinematic.fieldScanQuotaExceeded"));
        return;
      }

      if (!res.ok || !data.extraction) {
        throw new Error(data.error ?? t("marketingHome.cinematic.fieldScanError"));
      }

      setResult({
        extraction: data.extraction,
        summary: data.summary ?? "",
        confidence: data.confidence ?? "medium",
        assumptions: data.assumptions ?? [],
        registerUrl: data.registerUrl ?? "/login?mode=register",
      });
      setQuota({
        limit: data.limit ?? 2,
        used: (data.limit ?? 2) - (data.remaining ?? 0),
        remaining: data.remaining ?? 0,
        resetAt: data.resetAt ?? new Date().toISOString(),
      });
      setPhase("results");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("marketingHome.cinematic.fieldScanError");
      setErrorMessage(message);
      setPhase("preview");
      toast.error(message);
    }
  }, [fileMeta, locale, quota, t]);

  return {
    phase,
    quota,
    previewUrl,
    fileMeta,
    result,
    errorMessage,
    onFileSelected,
    analyze,
    clearPreview,
    refreshQuota,
  };
}
