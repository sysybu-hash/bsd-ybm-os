"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type CameraFacingMode = "environment" | "user";

type UseCameraStreamOptions = {
  audio?: boolean;
};

const ATTACH_MAX_FRAMES = 40;

export function pickVideoRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

export function mapCameraError(err: unknown): string {
  if (err instanceof Error && err.message === "CAMERA_UNSUPPORTED") {
    return "CAMERA_UNSUPPORTED";
  }
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError" || err.name === "SecurityError") {
      return "CAMERA_DENIED";
    }
    if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      return "CAMERA_NOT_FOUND";
    }
    if (err.name === "NotReadableError" || err.name === "AbortError") {
      return "CAMERA_BUSY";
    }
    if (err.name === "OverconstrainedError") {
      return "CAMERA_CONSTRAINTS";
    }
  }
  return err instanceof Error ? err.message : String(err);
}

export function useCameraStream({ audio = false }: UseCameraStreamOptions = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [opening, setOpening] = useState(false);
  const [facingMode, setFacingMode] = useState<CameraFacingMode>("environment");
  const [error, setError] = useState<string | null>(null);

  const attachToVideo = useCallback(async (stream: MediaStream): Promise<boolean> => {
    const el = videoRef.current;
    if (!el) return false;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    try {
      await el.play();
    } catch {
      /* muted preview — play() may reject until metadata loads */
    }
    return el.srcObject === stream;
  }, []);

  const attachStreamWhenReady = useCallback(
    async (stream: MediaStream): Promise<boolean> => {
      for (let i = 0; i < ATTACH_MAX_FRAMES; i++) {
        if (await attachToVideo(stream)) return true;
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
      }
      return false;
    },
    [attachToVideo],
  );

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    const el = videoRef.current;
    if (el) el.srcObject = null;
    setActive(false);
    setOpening(false);
  }, []);

  const requestStream = useCallback(
    async (mode: CameraFacingMode): Promise<MediaStream> => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("CAMERA_UNSUPPORTED");
      }

      const attempts: MediaStreamConstraints[] = [
        {
          audio: audio ? { echoCancellation: true } : false,
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        {
          audio: audio ? true : false,
          video: { facingMode: { ideal: mode } },
        },
        {
          audio: audio ? true : false,
          video: { facingMode: mode },
        },
        {
          audio: audio ? true : false,
          video: true,
        },
      ];

      let lastErr: unknown;
      for (const constraints of attempts) {
        try {
          return await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err: unknown) {
          lastErr = err;
          if (
            err instanceof DOMException &&
            (err.name === "NotAllowedError" ||
              err.name === "SecurityError" ||
              err.name === "PermissionDeniedError")
          ) {
            throw err;
          }
        }
      }
      throw lastErr ?? new Error("CAMERA_CONSTRAINTS");
    },
    [audio],
  );

  const start = useCallback(
    async (mode?: CameraFacingMode) => {
      setError(null);
      setOpening(true);
      const nextMode = mode ?? facingMode;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      try {
        const stream = await requestStream(nextMode);
        streamRef.current = stream;
        setFacingMode(nextMode);
        setActive(true);
        const attached = await attachStreamWhenReady(stream);
        if (!attached) {
          throw new Error("CAMERA_PREVIEW_ATTACH_FAILED");
        }
        setOpening(false);
      } catch (err: unknown) {
        streamRef.current?.getTracks().forEach((tr) => tr.stop());
        streamRef.current = null;
        setActive(false);
        setOpening(false);
        setError(mapCameraError(err));
        throw err;
      }
    },
    [attachStreamWhenReady, facingMode, requestStream],
  );

  const flip = useCallback(async () => {
    const next: CameraFacingMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    if (active) await start(next);
  }, [active, facingMode, start]);

  const previewOpen = active || opening;

  useLayoutEffect(() => {
    if (!previewOpen || !streamRef.current) return;
    void attachStreamWhenReady(streamRef.current);
  }, [attachStreamWhenReady, previewOpen]);

  useEffect(() => () => stop(), [stop]);

  return {
    videoRef,
    streamRef,
    active,
    opening,
    previewOpen,
    facingMode,
    error,
    setError,
    start,
    stop,
    flip,
  };
}

export async function capturePhotoFromVideo(video: HTMLVideoElement): Promise<File | null> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92);
  });
  if (!blob) return null;
  return new File([blob], `field-photo-${Date.now()}.jpg`, { type: "image/jpeg" });
}
