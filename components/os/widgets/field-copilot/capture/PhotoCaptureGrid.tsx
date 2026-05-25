"use client";

import { Camera, ImagePlus, VideoOff } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { capturePhotoFromVideo, useCameraStream } from "@/hooks/useCameraStream";
import CameraPreviewFrame from "./CameraPreviewFrame";

type Props = {
  photoCount: number;
  onPhoto: (file: File) => Promise<void>;
  uploading: boolean;
};

export default function PhotoCaptureGrid({ photoCount, onPhoto, uploading }: Props) {
  const { t } = useI18n();
  const {
    videoRef,
    active,
    opening,
    previewOpen,
    error,
    setError,
    start,
    stop,
    flip,
  } = useCameraStream({ audio: false });
  const galleryRef = useRef<HTMLInputElement>(null);
  const [snapBusy, setSnapBusy] = useState(false);

  const openCamera = useCallback(async () => {
    setError(null);
    try {
      await start();
    } catch {
      /* error state set in hook */
    }
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

  const atLimit = photoCount >= 8;
  const disabled = uploading || atLimit || snapBusy || opening;

  return (
    <section className="rounded-xl border border-[color:var(--border-main)] p-4">
      <h4 className="mb-2 font-bold">{t("workspaceWidgets.fieldCopilot.photoTitle")}</h4>
      <p className="mb-3 text-xs text-[color:var(--foreground-muted)]">
        {t("workspaceWidgets.fieldCopilot.photoHint").replace("{count}", String(photoCount)).replace("{max}", "8")}
      </p>

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
            for (let i = 0; i < files.length && photoCount + i < 8; i++) {
              const f = files[i];
              if (f) await onPhoto(f);
            }
          })();
          e.target.value = "";
        }}
      />

      {error ? (
        <p className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
          {t("workspaceWidgets.fieldCopilot.cameraError")}
        </p>
      ) : null}

      {previewOpen ? (
        <div className="mb-3 space-y-3">
          <CameraPreviewFrame
            videoRef={videoRef}
            onFlip={() => void flip()}
            flipDisabled={disabled}
          />
          {opening ? (
            <p className="text-center text-xs text-[color:var(--foreground-muted)]">
              {t("workspaceWidgets.fieldCopilot.cameraOpening")}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => void snapPhoto()}
              className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 font-bold text-white disabled:opacity-40"
            >
              <Camera size={22} />
              {t("workspaceWidgets.fieldCopilot.photoShutter")}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => galleryRef.current?.click()}
              className="flex min-h-[52px] items-center justify-center rounded-xl border border-[color:var(--border-main)] px-4"
              aria-label={t("workspaceWidgets.fieldCopilot.photoGallery")}
              title={t("workspaceWidgets.fieldCopilot.photoGallery")}
            >
              <ImagePlus size={22} />
            </button>
            <button
              type="button"
              disabled={uploading || opening}
              onClick={() => stop()}
              className="flex min-h-[52px] items-center justify-center rounded-xl border border-[color:var(--border-main)] px-3"
              aria-label={t("workspaceWidgets.fieldCopilot.cameraClose")}
              title={t("workspaceWidgets.fieldCopilot.cameraClose")}
            >
              <VideoOff size={20} />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={disabled || opening}
            onClick={() => void openCamera()}
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 font-bold text-white disabled:opacity-40"
          >
            <Camera size={20} />
            {opening
              ? t("workspaceWidgets.fieldCopilot.cameraOpening")
              : t("workspaceWidgets.fieldCopilot.cameraOpenPhoto")}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => galleryRef.current?.click()}
            className="flex min-h-[48px] items-center justify-center rounded-xl border border-[color:var(--border-main)] px-4"
            aria-label={t("workspaceWidgets.fieldCopilot.photoGallery")}
            title={t("workspaceWidgets.fieldCopilot.photoGallery")}
          >
            <ImagePlus size={20} />
          </button>
        </div>
      )}
    </section>
  );
}
