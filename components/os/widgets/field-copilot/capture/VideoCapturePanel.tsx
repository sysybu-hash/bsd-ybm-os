"use client";

import { Square, Trash2, Video, VideoOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { pickVideoRecorderMime, useCameraStream } from "@/hooks/useCameraStream";
import CameraPreviewFrame from "./CameraPreviewFrame";

const MAX_SEC = 90;

type Props = {
  hasVideo: boolean;
  videoAssetId?: string;
  onVideo: (blob: Blob) => Promise<void>;
  onDeleteVideo: () => Promise<void>;
  uploading: boolean;
};

export default function VideoCapturePanel({ hasVideo, videoAssetId, onVideo, onDeleteVideo, uploading }: Props) {
  const { t } = useI18n();
  const { videoRef, streamRef, active, opening, previewOpen, error, setError, start, stop, flip } =
    useCameraStream({ audio: true });
  const [recording, setRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    timerRef.current = null;
    maxTimerRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    clearTimers();
    recRef.current?.stop();
    recRef.current = null;
    setRecording(false);
    setElapsedSec(0);
  }, [clearTimers]);

  const closeCamera = useCallback(() => {
    stopRecording();
    stop();
  }, [stop, stopRecording]);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      if (!active) await start();
      const stream = streamRef.current;
      if (!stream) throw new Error("no stream");
      const mime = pickVideoRecorderMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const type = rec.mimeType || mime || "video/webm";
        const blob = new Blob(chunksRef.current, { type });
        stop();
        void onVideo(blob);
      };
      recRef.current = rec;
      rec.start(1000);
      setRecording(true);
      setElapsedSec(0);
      timerRef.current = setInterval(() => { setElapsedSec((s) => s + 1); }, 1000);
      maxTimerRef.current = setTimeout(() => stopRecording(), MAX_SEC * 1000);
    } catch {
      stopRecording();
      setError(t("workspaceWidgets.fieldCopilot.cameraError"));
    }
  }, [active, onVideo, setError, start, stop, stopRecording, streamRef, t]);

  const openPreview = useCallback(async () => {
    setError(null);
    try { await start(); } catch { setError(t("workspaceWidgets.fieldCopilot.cameraError")); }
  }, [setError, start, t]);

  useEffect(() => {
    return () => { clearTimers(); stop(); };
  }, [clearTimers, stop]);

  const handleDelete = async () => {
    setDeleting(true);
    try { await onDeleteVideo(); }
    finally { setDeleting(false); }
  };

  return (
    <section className="rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h4 className="font-bold text-sm">{t("workspaceWidgets.fieldCopilot.videoTitle")}</h4>
        {hasVideo && videoAssetId ? (
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleting || uploading}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 transition disabled:opacity-50"
          >
            <Trash2 size={11} />
            {t("workspaceWidgets.fieldCopilot.videoDelete")}
          </button>
        ) : null}
      </div>

      {/* Recorded video preview */}
      {hasVideo && videoAssetId && !previewOpen ? (
        <div className="px-4 pb-4">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={`/api/field-copilot/assets/${videoAssetId}`}
            controls
            playsInline
            className="w-full rounded-xl border border-[color:var(--border-main)] bg-black max-h-[240px] object-contain"
            aria-label={t("workspaceWidgets.fieldCopilot.videoSaved")}
          />
          <p className="mt-2 text-center text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            {t("workspaceWidgets.fieldCopilot.videoSaved")}
          </p>
          <button
            type="button"
            disabled={uploading || opening}
            onClick={() => void openPreview()}
            className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/10 text-sm font-bold text-violet-700 dark:text-violet-300 transition active:scale-95"
          >
            <Video size={18} />
            {t("workspaceWidgets.fieldCopilot.videoRerecord")}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="mx-4 mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
          {t("workspaceWidgets.fieldCopilot.cameraError")}
        </p>
      ) : null}

      {/* Camera preview */}
      {previewOpen ? (
        <div className="px-4 pb-4 space-y-3">
          <CameraPreviewFrame
            videoRef={videoRef}
            recording={recording}
            elapsedSec={elapsedSec}
            maxSec={MAX_SEC}
            onFlip={() => void flip()}
            flipDisabled={uploading || recording || opening}
          />
          {opening ? (
            <p className="text-center text-xs text-[color:var(--foreground-muted)]">
              {t("workspaceWidgets.fieldCopilot.cameraOpening")}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {recording ? (
              <button
                type="button"
                disabled={uploading}
                onClick={stopRecording}
                className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 font-bold text-white disabled:opacity-40 active:scale-95 transition"
              >
                <Square size={20} />
                {t("workspaceWidgets.fieldCopilot.videoStop")}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={uploading || opening || !active}
                  onClick={() => void startRecording()}
                  className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 font-bold text-white disabled:opacity-40 active:scale-95 transition"
                >
                  <Video size={20} />
                  {t("workspaceWidgets.fieldCopilot.videoStart")}
                </button>
                <button
                  type="button"
                  disabled={uploading || opening}
                  onClick={closeCamera}
                  className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-[color:var(--border-main)] px-4 font-bold active:scale-95 transition"
                >
                  <VideoOff size={18} />
                  {t("workspaceWidgets.fieldCopilot.cameraClose")}
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* Start recording button — when no video and camera not open */}
      {!hasVideo && !previewOpen ? (
        <div className="px-4 pb-4">
          <p className="mb-3 text-xs text-[color:var(--foreground-muted)]">
            {t("workspaceWidgets.fieldCopilot.videoHint")}
          </p>
          <button
            type="button"
            disabled={uploading || opening}
            onClick={() => void openPreview()}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-violet-600 font-bold text-white disabled:opacity-40 active:scale-95 transition"
          >
            <Video size={20} />
            {opening
              ? t("workspaceWidgets.fieldCopilot.cameraOpening")
              : t("workspaceWidgets.fieldCopilot.cameraOpenVideo")}
          </button>
        </div>
      ) : null}
    </section>
  );
}
