"use client";

import { Camera, ImagePlus, Loader2, VideoOff, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { capturePhotoFromVideo, useCameraStream } from "@/hooks/useCameraStream";
import CameraPreviewFrame from "./CameraPreviewFrame";

const MAX_PHOTOS = 8;

type Props = {
  photoAssetIds: string[];
  onPhoto: (file: File) => Promise<void>;
  onDeletePhoto: (id: string) => Promise<void>;
  uploading: boolean;
};

export default function PhotoCaptureGrid({ photoAssetIds, onPhoto, onDeletePhoto, uploading }: Props) {
  const { t } = useI18n();
  const {
    videoRef, active, opening, previewOpen, error, setError, start, stop, flip,
  } = useCameraStream({ audio: false });
  const galleryRef = useRef<HTMLInputElement>(null);
  const [snapBusy, setSnapBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const openCamera = useCallback(async () => {
    setError(null);
    try { await start(); } catch { /* error set in hook */ }
  }, [setError, start]);

  const snapPhoto = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    setSnapBusy(true);
    try {
      const file = await capturePhotoFromVideo(video);
      if (file) await onPhoto(file);
    } finally {
      setSnapBusy(false);
    }
  }, [onPhoto, videoRef]);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try { await onDeletePhoto(id); }
    finally { setDeletingId(null); }
  }, [onDeletePhoto]);

  const atLimit = photoAssetIds.length >= MAX_PHOTOS;
  const busy = uploading || snapBusy || opening;

  return (
    <section className="rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h4 className="font-bold text-sm">
          {t("workspaceWidgets.fieldCopilot.photoTitle")}
        </h4>
        <span className="text-xs font-bold text-[color:var(--foreground-muted)]">
          {photoAssetIds.length}/{MAX_PHOTOS}
        </span>
      </div>

      {/* Camera preview */}
      {previewOpen ? (
        <div className="px-4 pb-3 space-y-3">
          <CameraPreviewFrame
            videoRef={videoRef}
            onFlip={() => void flip()}
            flipDisabled={busy}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || atLimit}
              onClick={() => void snapPhoto()}
              className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 font-bold text-white disabled:opacity-40 active:scale-95 transition"
            >
              {snapBusy ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
              {t("workspaceWidgets.fieldCopilot.photoShutter")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => galleryRef.current?.click()}
              className="flex min-h-[52px] items-center justify-center rounded-xl border border-[color:var(--border-main)] px-4 active:scale-95 transition"
              aria-label={t("workspaceWidgets.fieldCopilot.photoGallery")}
            >
              <ImagePlus size={20} />
            </button>
            <button
              type="button"
              disabled={uploading || opening}
              onClick={() => stop()}
              className="flex min-h-[52px] items-center justify-center rounded-xl border border-[color:var(--border-main)] px-3 active:scale-95 transition"
              aria-label={t("workspaceWidgets.fieldCopilot.cameraClose")}
            >
              <VideoOff size={18} />
            </button>
          </div>
        </div>
      ) : null}

      {/* Thumbnail grid */}
      {photoAssetIds.length > 0 || uploading ? (
        <div className="grid grid-cols-3 gap-2 px-4 pb-3 sm:grid-cols-4">
          {photoAssetIds.map((id) => (
            <div key={id} className="relative aspect-square overflow-hidden rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-soft)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/field-copilot/assets/${id}`}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <button
                type="button"
                onClick={() => void handleDelete(id)}
                disabled={deletingId === id || uploading}
                className="absolute end-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-rose-600 disabled:opacity-60"
                aria-label={t("workspaceWidgets.fieldCopilot.photoDelete")}
              >
                {deletingId === id
                  ? <Loader2 size={12} className="animate-spin" />
                  : <X size={12} />}
              </button>
            </div>
          ))}
          {/* Upload in-progress placeholder */}
          {uploading ? (
            <div className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-[color:var(--border-main)] bg-[color:var(--surface-soft)]">
              <Loader2 size={22} className="animate-spin text-emerald-500" />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Error */}
      {error ? (
        <p className="mx-4 mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
          {t("workspaceWidgets.fieldCopilot.cameraError")}
        </p>
      ) : null}

      {/* Action buttons — shown when camera not open */}
      {!previewOpen ? (
        <div className="flex gap-2 px-4 pb-4">
          <button
            type="button"
            disabled={busy || atLimit}
            onClick={() => void openCamera()}
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 font-bold text-white disabled:opacity-40 active:scale-95 transition"
          >
            {opening ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
            {opening
              ? t("workspaceWidgets.fieldCopilot.cameraOpening")
              : atLimit
                ? t("workspaceWidgets.fieldCopilot.photoLimitReached")
                : t("workspaceWidgets.fieldCopilot.cameraOpenPhoto")}
          </button>
          <button
            type="button"
            disabled={busy || atLimit}
            onClick={() => galleryRef.current?.click()}
            className="flex min-h-[48px] items-center justify-center rounded-xl border border-[color:var(--border-main)] px-4 disabled:opacity-40 active:scale-95 transition"
            aria-label={t("workspaceWidgets.fieldCopilot.photoGallery")}
          >
            <ImagePlus size={20} />
          </button>
        </div>
      ) : null}

      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (!files?.length) return;
          void (async () => {
            for (let i = 0; i < files.length && photoAssetIds.length + i < MAX_PHOTOS; i++) {
              const f = files[i];
              if (f) await onPhoto(f);
            }
          })();
          e.target.value = "";
        }}
      />
    </section>
  );
}
