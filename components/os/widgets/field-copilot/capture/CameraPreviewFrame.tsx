"use client";

import { FlipHorizontal2 } from "lucide-react";
import type { RefObject } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  recording?: boolean;
  elapsedSec?: number;
  maxSec?: number;
  onFlip?: () => void;
  flipDisabled?: boolean;
};

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function CameraPreviewFrame({
  videoRef,
  recording = false,
  elapsedSec = 0,
  maxSec,
  onFlip,
  flipDisabled,
}: Props) {
  const { t } = useI18n();

  return (
    <div className="relative overflow-hidden rounded-xl border border-[color:var(--border-main)] bg-black">
      <video
        ref={videoRef as React.Ref<HTMLVideoElement>}
        playsInline
        muted
        autoPlay
        className="aspect-video max-h-[min(42vh,320px)] w-full object-cover"
        aria-label={t("workspaceWidgets.fieldCopilot.cameraPreviewAria")}
      />

      {recording ? (
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 py-2">
          <span className="flex items-center gap-2 text-xs font-bold text-white">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" aria-hidden />
            {t("workspaceWidgets.fieldCopilot.recordingLive")}
            <span className="font-mono tabular-nums">{formatElapsed(elapsedSec)}</span>
            {maxSec != null ? (
              <span className="text-white/70">/ {formatElapsed(maxSec)}</span>
            ) : null}
          </span>
        </div>
      ) : (
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/50 to-transparent px-3 py-2">
          <span className="text-xs font-bold text-white">
            {t("workspaceWidgets.fieldCopilot.cameraPreviewLive")}
          </span>
        </div>
      )}

      {onFlip ? (
        <button
          type="button"
          disabled={flipDisabled}
          onClick={() => void onFlip()}
          className="absolute bottom-2 end-2 flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full border border-white/30 bg-black/50 text-white backdrop-blur-sm disabled:opacity-40"
          aria-label={t("workspaceWidgets.fieldCopilot.cameraFlip")}
          title={t("workspaceWidgets.fieldCopilot.cameraFlip")}
        >
          <FlipHorizontal2 size={20} />
        </button>
      ) : null}
    </div>
  );
}
