"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, FlipHorizontal2, Loader2, X } from "lucide-react";
import { capturePhotoFromVideo, useCameraStream } from "@/hooks/useCameraStream";

type Props = Readonly<{
  onCapture: (file: File) => void;
  onClose: () => void;
  /** Shown as a button when the camera can't start (denied/unsupported/no device) — caller falls back to a plain file input. */
  onFallbackToFile: () => void;
  labels: {
    live: string;
    shutter: string;
    flip: string;
    close: string;
    error: string;
    useFileInstead: string;
  };
}>;

/**
 * Full-screen in-page camera (getUserMedia), used instead of `<input capture>`.
 * The native camera app that `<input capture>` launches is heavy enough that Android
 * often kills the browser tab under memory pressure while it's foregrounded — on
 * return, the tab silently reloads and all in-memory app state (open windows, staged
 * scan) is lost. Staying inside the page avoids handing off to that external app.
 */
export default function InPageCameraCapture({ onCapture, onClose, onFallbackToFile, labels }: Props) {
  const { videoRef, active, opening, error, start, stop, flip } = useCameraStream({ audio: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snap = async () => {
    const video = videoRef.current;
    if (!video) return;
    setBusy(true);
    try {
      const file = await capturePhotoFromVideo(video);
      if (file) onCapture(file);
    } finally {
      setBusy(false);
    }
  };

  if (typeof document === "undefined") return null;

  // Portaled to <body> — an ancestor window/widget wrapper elsewhere in the OS shell
  // may set a CSS transform (for drag/resize), which turns it into the containing
  // block for any `position: fixed` descendant and traps this overlay inside the
  // widget's bounds instead of covering the full viewport.
  return createPortal(
    <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center gap-4 bg-black/90 p-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/20 bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="aspect-[3/4] w-full object-cover"
        />
        {opening ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <Loader2 className="animate-spin text-white" size={32} aria-hidden />
          </div>
        ) : (
          <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent px-3 py-2">
            <span className="text-xs font-bold text-white">{labels.live}</span>
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={labels.close}
          className="absolute end-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white"
        >
          <X size={18} aria-hidden />
        </button>
        <button
          type="button"
          disabled={!active}
          onClick={() => void flip()}
          aria-label={labels.flip}
          className="absolute start-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-40"
        >
          <FlipHorizontal2 size={18} aria-hidden />
        </button>
      </div>

      {error ? (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-sm font-semibold text-rose-300">{labels.error}</p>
          <button
            type="button"
            onClick={onFallbackToFile}
            className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white"
          >
            {labels.useFileInstead}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={!active || busy}
          onClick={() => void snap()}
          aria-label={labels.shutter}
          className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 disabled:opacity-40"
        >
          {busy ? <Loader2 className="animate-spin text-white" size={24} aria-hidden /> : <Camera className="text-white" size={26} aria-hidden />}
        </button>
      )}
    </div>,
    document.body,
  );
}
