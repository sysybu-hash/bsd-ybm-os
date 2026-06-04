"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { Camera, FileText, FileUp, Loader2, ScanLine, Sparkles, Upload } from "lucide-react";
import MarketingFieldScanResults from "@/components/landing/marketing/MarketingFieldScanResults";
import { useMarketingDemoScan } from "@/hooks/useMarketingDemoScan";
import { useI18n } from "@/components/os/system/I18nProvider";
import { buildMarketingPublicUrls } from "@/lib/marketing/canonical-site";

const ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,application/pdf,.pdf,image/*";

export default function MarketingFieldScanDemo() {
  const { t, locale } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const scan = useMarketingDemoScan(t, locale);
  const registerHref = buildMarketingPublicUrls().register;

  const remaining = scan.quota?.remaining ?? 2;
  const limit = scan.quota?.limit ?? 2;
  const canInteract = (scan.phase === "idle" || scan.phase === "preview") && remaining > 0;
  const showCapture =
    scan.phase === "idle" || scan.phase === "preview" || scan.phase === "analyzing";
  const isPdf = scan.fileMeta?.mimeType === "application/pdf";

  const pickFile = useCallback(() => {
    if (!canInteract) return;
    fileRef.current?.click();
  }, [canInteract]);

  const openCamera = useCallback(() => {
    if (!canInteract) return;
    cameraRef.current?.click();
  }, [canInteract]);

  const onDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (canInteract) setDragOver(true);
    },
    [canInteract],
  );

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setDragOver(false);
  }, []);

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (canInteract) setDragOver(true);
    },
    [canInteract],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (!canInteract) return;
      const file = e.dataTransfer.files?.[0] ?? null;
      void scan.onFileSelected(file);
    },
    [canInteract, scan],
  );

  return (
    <div className="mkt-hero-demo-card mx-auto w-full max-w-md md:max-w-none">
      <div className="mkt-glass flex h-full flex-col overflow-hidden rounded-3xl border-2 border-white/20 p-2 shadow-2xl">
        <div className="mkt-hero-demo-inner flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.35rem] bg-slate-950">
          <header className="mkt-hero-demo-chrome flex-col justify-center gap-1 bg-slate-950/80 text-center sm:flex-row sm:gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white">
                {t("marketingHome.cinematic.fieldScanTitle")}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
                {t("marketingHome.cinematic.fieldScanSubtitle")}
              </p>
            </div>
            <p className="shrink-0 rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold text-emerald-400">
              {t("marketingHome.cinematic.fieldScanQuota", {
                remaining: String(remaining),
                limit: String(limit),
              })}
            </p>
          </header>

          {showCapture ? (
            <div className="flex min-h-0 flex-1 flex-col p-4">
              <div
                role="button"
                tabIndex={canInteract ? 0 : -1}
                aria-labelledby="mkt-scan-hint-primary mkt-scan-hint-secondary"
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    pickFile();
                  }
                }}
                onClick={() => {
                  if (scan.phase === "idle") pickFile();
                }}
                onDragEnter={onDragEnter}
                onDragLeave={onDragLeave}
                onDragOver={onDragOver}
                onDrop={onDrop}
                className={`mkt-scan-dropzone relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border-2 border-dashed transition-colors ${
                  dragOver
                    ? "border-emerald-400 bg-emerald-500/10"
                    : "border-emerald-400/50 bg-gradient-to-b from-slate-800/90 to-slate-950"
                } ${canInteract ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}
              >
                <div className="relative flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
                  {scan.previewUrl && !isPdf ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={scan.previewUrl}
                      alt=""
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : scan.fileMeta && isPdf ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-400/30">
                        <FileText className="h-9 w-9 text-emerald-300" aria-hidden />
                      </div>
                      <p className="max-w-full truncate text-sm font-semibold text-white">
                        {scan.fileMeta.name}
                      </p>
                      <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-slate-300">
                        PDF
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
                        <Upload className="h-8 w-8 text-emerald-400/80" aria-hidden />
                      </div>
                      <p
                        id="mkt-scan-hint-primary"
                        className="max-w-[16rem] text-sm font-medium leading-relaxed text-slate-200"
                      >
                        {t("marketingHome.cinematic.fieldScanPickHint")}
                      </p>
                      <p id="mkt-scan-hint-secondary" className="text-[11px] text-slate-400">
                        {t("marketingHome.cinematic.fieldScanDropHint")}
                      </p>
                    </>
                  )}

                  {dragOver ? (
                    <p className="absolute inset-x-0 bottom-4 text-center text-xs font-bold text-emerald-300">
                      {t("marketingHome.cinematic.fieldScanDropActive")}
                    </p>
                  ) : null}
                </div>

                {scan.phase === "analyzing" ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80 backdrop-blur-sm">
                    <Loader2 className="h-10 w-10 animate-spin text-emerald-400" aria-hidden />
                    <span className="rounded-full bg-black/60 px-4 py-1.5 text-xs font-bold text-white">
                      {t("marketingHome.cinematic.fieldScanAnalyzing")}
                    </span>
                  </div>
                ) : null}
              </div>

              {scan.phase !== "analyzing" && canInteract ? (
                <div className="mt-3 grid shrink-0 grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openCamera();
                    }}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-emerald-400/50 bg-emerald-700 px-3 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-emerald-600"
                  >
                    <Camera className="h-4 w-4 shrink-0" aria-hidden />
                    {t("marketingHome.cinematic.fieldScanCamera")}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      pickFile();
                    }}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2.5 text-xs font-bold text-white transition hover:border-emerald-500/40 hover:bg-slate-800"
                  >
                    <FileUp className="h-4 w-4 shrink-0" aria-hidden />
                    {t("marketingHome.cinematic.fieldScanPick")}
                  </button>
                </div>
              ) : null}

              {scan.phase === "preview" && scan.fileMeta && canInteract ? (
                <button
                  type="button"
                  onClick={() => void scan.analyze()}
                  className="mt-2 w-full rounded-xl bg-gradient-to-l from-emerald-600 to-emerald-500 py-3.5 text-sm font-bold text-white shadow-lg transition hover:brightness-110"
                >
                  {t("marketingHome.cinematic.fieldScanAnalyze")}
                </button>
              ) : null}

              {scan.errorMessage ? (
                <p className="mt-2 text-center text-xs text-amber-200">{scan.errorMessage}</p>
              ) : null}
            </div>
          ) : null}

          {(scan.phase === "results" || scan.phase === "quota_exceeded") && (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto border-t border-emerald-500/20 bg-emerald-950/40 p-4">
              {scan.phase === "results" && scan.result ? (
                <MarketingFieldScanResults
                  result={scan.result}
                  registerHref={registerHref}
                  onScanAnother={scan.clearPreview}
                  canScanAnother={(scan.quota?.remaining ?? 0) > 0}
                />
              ) : (
                <div className="min-h-[200px] space-y-3 py-6 text-center">
                  <ScanLine className="mx-auto h-8 w-8 text-amber-400/80" aria-hidden />
                  <p className="text-sm font-semibold text-amber-100">
                    {t("marketingHome.cinematic.fieldScanQuotaExceeded")}
                  </p>
                  <Link
                    href={registerHref}
                    className="inline-flex w-full items-center justify-center rounded-xl mkt-btn-primary px-4 py-2.5 text-sm font-bold"
                  >
                    {t("marketingHome.cinematic.fieldScanRegisterCta")}
                  </Link>
                </div>
              )}
            </div>
          )}

          {showCapture && scan.phase === "idle" ? (
            <div className="flex shrink-0 items-center justify-center gap-2 border-t border-white/5 px-4 py-2.5 text-emerald-400/90">
              <ScanLine className="h-3.5 w-3.5" aria-hidden />
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              <span className="text-[10px] font-bold tracking-wide">Gemini Vision</span>
            </div>
          ) : null}
        </div>
      </div>

      <label htmlFor="mkt-field-scan-file" className="sr-only">
        {t("marketingHome.cinematic.fieldScanPick")}
      </label>
      <input
        id="mkt-field-scan-file"
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          void scan.onFileSelected(file);
          e.target.value = "";
        }}
      />
      <label htmlFor="mkt-field-scan-camera" className="sr-only">
        {t("marketingHome.cinematic.fieldScanCamera")}
      </label>
      <input
        id="mkt-field-scan-camera"
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          void scan.onFileSelected(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
