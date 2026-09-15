"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Minus, Plus, RotateCcw, X, ChevronRight, ChevronLeft } from "lucide-react";
import { useIsMounted } from "@/hooks/use-is-mounted";
import { OS_FULLSCREEN_MEDIA_CLASS, OS_FULLSCREEN_MEDIA_Z } from "@/lib/os-modal-z-index";
import type { FloorplanVizImage } from "@/lib/projects/floorplan-layout";
import { OsIconButton } from "@/components/os/ui";

const Z = OS_FULLSCREEN_MEDIA_Z;

type TFn = (key: string, vars?: Record<string, string>) => string;

function srcOf(img: FloorplanVizImage): string {
  if (img.base64) return `data:${img.mimeType};base64,${img.base64}`;
  return img.src ?? "";
}

function fileNameOf(img: FloorplanVizImage, index: number): string {
  const ext = img.mimeType.includes("jpeg") || img.mimeType.includes("jpg") ? "jpg" : "png";
  const base = (img.roomName ?? img.viewId ?? `viz-${index + 1}`).replace(/[^\w\u0590-\u05FF-]+/g, "-");
  return `${base || "viz"}-${index + 1}.${ext}`;
}

export default function FloorplanVizLightbox({
  t,
  images,
  index,
  onClose,
  onIndex,
}: {
  t: TFn;
  images: FloorplanVizImage[];
  index: number;
  onClose: () => void;
  onIndex: (next: number) => void;
}) {
  const mounted = useIsMounted();
  const img = images[index];
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [viewIndex, setViewIndex] = useState(index);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const resetView = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Moving to another image starts it unzoomed and centred. Adjusted during
  // render rather than in an effect: an effect would paint the new image at the
  // previous image's zoom for one frame before correcting it.
  if (viewIndex !== index) {
    setViewIndex(index);
    setScale(1);
    setPan({ x: 0, y: 0 });
  }

  useEffect(() => {
    document.body.classList.add(OS_FULLSCREEN_MEDIA_CLASS);
    return () => document.body.classList.remove(OS_FULLSCREEN_MEDIA_CLASS);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex(index <= 0 ? images.length - 1 : index - 1);
      if (e.key === "ArrowLeft") onIndex(index >= images.length - 1 ? 0 : index + 1);
      if (e.key === "+" || e.key === "=") setScale((s) => Math.min(5, s + 0.25));
      if (e.key === "-" || e.key === "_") setScale((s) => Math.max(0.5, s - 0.25));
      if (e.key === "0") resetView();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, index, onClose, onIndex, resetView]);

  if (!mounted || !img) return null;

  const src = srcOf(img);

  return createPortal(
    <div
      className="fixed inset-0 flex flex-col bg-black/90"
      style={{ zIndex: Z }}
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label={img.labelHe}
      onClick={onClose}
    >
      <div
        className="flex shrink-0 items-center gap-2 px-3 py-2 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{img.labelHe}</p>
        <span className="text-[11px] text-white/70">
          {index + 1} / {images.length}
        </span>
        <OsIconButton label={t("workspaceWidgets.floorplanViz.zoomOut")} size="sm" onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}>
          <Minus size={16} className="text-white" />
        </OsIconButton>
        <OsIconButton label={t("workspaceWidgets.floorplanViz.zoomIn")} size="sm" onClick={() => setScale((s) => Math.min(5, s + 0.25))}>
          <Plus size={16} className="text-white" />
        </OsIconButton>
        <OsIconButton label={t("workspaceWidgets.floorplanViz.zoomReset")} size="sm" onClick={resetView}>
          <RotateCcw size={16} className="text-white" />
        </OsIconButton>
        <a
          href={src}
          download={fileNameOf(img, index)}
          className="quiet-button inline-flex h-8 w-8 items-center justify-center !min-h-0 !p-0 text-white"
          aria-label={t("projectDashboard.vizDownload")}
        >
          <Download size={16} />
        </a>
        <OsIconButton label={t("workspaceWidgets.floorplanViz.closePreview")} size="sm" onClick={onClose}>
          <X size={16} className="text-white" />
        </OsIconButton>
      </div>
      <div
        className="relative flex min-h-0 flex-1 cursor-grab items-center justify-center overflow-hidden active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => {
          e.preventDefault();
          const delta = e.deltaY > 0 ? -0.15 : 0.15;
          setScale((s) => Math.min(5, Math.max(0.5, s + delta)));
        }}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setPan({
            x: drag.current.px + (e.clientX - drag.current.x),
            y: drag.current.py + (e.clientY - drag.current.y),
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        {images.length > 1 ? (
          <>
            <button
              type="button"
              className="absolute end-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              aria-label={t("workspaceWidgets.floorplanViz.prevImage")}
              onClick={() => onIndex(index <= 0 ? images.length - 1 : index - 1)}
            >
              <ChevronRight size={22} />
            </button>
            <button
              type="button"
              className="absolute start-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              aria-label={t("workspaceWidgets.floorplanViz.nextImage")}
              onClick={() => onIndex(index >= images.length - 1 ? 0 : index + 1)}
            >
              <ChevronLeft size={22} />
            </button>
          </>
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={img.labelHe}
          draggable={false}
          className="pointer-events-none max-h-[88%] max-w-[92%] select-none object-contain"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: "center center",
          }}
        />
      </div>
    </div>,
    document.body,
  );
}

export { srcOf, fileNameOf };
