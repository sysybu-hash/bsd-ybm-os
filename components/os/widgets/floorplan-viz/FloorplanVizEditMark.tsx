"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, X } from "lucide-react";
import { useIsMounted } from "@/hooks/use-is-mounted";
import { OS_FULLSCREEN_MEDIA_CLASS, OS_FULLSCREEN_MEDIA_Z } from "@/lib/os-modal-z-index";
import type { FloorplanVizImage } from "@/lib/projects/floorplan-layout";
import { clampFloorplanVizEditRegion, type FloorplanVizEditRegion } from "@/lib/projects/floorplan-viz-edit-region";
import { OsButton, OsIconButton } from "@/components/os/ui";
import { srcOf } from "@/components/os/widgets/floorplan-viz/FloorplanVizLightbox";

const Z = OS_FULLSCREEN_MEDIA_Z;

type TFn = (key: string, vars?: Record<string, string>) => string;

type Box = { left: number; top: number; width: number; height: number };

function containBox(img: HTMLImageElement): Box | null {
  const rect = img.getBoundingClientRect();
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (!nw || !nh || rect.width < 4 || rect.height < 4) return null;
  const scale = Math.min(rect.width / nw, rect.height / nh);
  const width = nw * scale;
  const height = nh * scale;
  return {
    left: rect.left + (rect.width - width) / 2,
    top: rect.top + (rect.height - height) / 2,
    width,
    height,
  };
}

function clientToNorm(clientX: number, clientY: number, box: Box): { x: number; y: number } {
  return {
    x: Math.min(1, Math.max(0, (clientX - box.left) / box.width)),
    y: Math.min(1, Math.max(0, (clientY - box.top) / box.height)),
  };
}

function regionFromDrag(
  start: { x: number; y: number },
  end: { x: number; y: number },
): FloorplanVizEditRegion | null {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return clampFloorplanVizEditRegion({
    x,
    y,
    w: Math.abs(end.x - start.x),
    h: Math.abs(end.y - start.y),
  });
}

export default function FloorplanVizEditMark({
  t,
  image,
  busy,
  onClose,
  onSubmit,
}: {
  t: TFn;
  image: FloorplanVizImage;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (instruction: string, region?: FloorplanVizEditRegion) => void;
}) {
  const mounted = useIsMounted();
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [region, setRegion] = useState<FloorplanVizEditRegion | null>(null);
  const [draft, setDraft] = useState<FloorplanVizEditRegion | null>(null);
  const [instruction, setInstruction] = useState("");
  /** The image's letterboxed frame inside the wrapper. Measured on load and resize, never during render. */
  const [frame, setFrame] = useState<Box | null>(null);

  const measureFrame = useCallback(() => {
    const wrap = wrapRef.current?.getBoundingClientRect();
    const img = imgRef.current;
    const box = img ? containBox(img) : null;
    setFrame(
      wrap && box
        ? { left: box.left - wrap.left, top: box.top - wrap.top, width: box.width, height: box.height }
        : null,
    );
  }, []);

  useEffect(() => {
    window.addEventListener("resize", measureFrame);
    return () => window.removeEventListener("resize", measureFrame);
  }, [measureFrame]);

  const overlay = draft ?? region;
  const overlayStyle =
    overlay && frame
      ? {
          left: frame.left + overlay.x * frame.width,
          top: frame.top + overlay.y * frame.height,
          width: overlay.w * frame.width,
          height: overlay.h * frame.height,
        }
      : undefined;

  useEffect(() => {
    document.body.classList.add(OS_FULLSCREEN_MEDIA_CLASS);
    return () => document.body.classList.remove(OS_FULLSCREEN_MEDIA_CLASS);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const onPointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (busy) return;
    const img = imgRef.current;
    if (!img) return;
    const box = containBox(img);
    if (!box) return;
    const point = clientToNorm(e.clientX, e.clientY, box);
    if (e.type === "pointerdown") {
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      drag.current = point;
      setDraft({ x: point.x, y: point.y, w: 0.02, h: 0.02 });
      return;
    }
    if (!drag.current) return;
    if (e.type === "pointermove") {
      setDraft(regionFromDrag(drag.current, point) ?? {
        x: Math.min(drag.current.x, point.x),
        y: Math.min(drag.current.y, point.y),
        w: Math.max(0.02, Math.abs(point.x - drag.current.x)),
        h: Math.max(0.02, Math.abs(point.y - drag.current.y)),
      });
      return;
    }
    const next = regionFromDrag(drag.current, point);
    drag.current = null;
    setDraft(null);
    setRegion(next);
  }, [busy]);

  if (!mounted) return null;

  const src = srcOf(image);

  return createPortal(
    <div
      className="fixed inset-0 flex flex-col bg-black/80"
      style={{ zIndex: Z }}
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label={t("workspaceWidgets.floorplanViz.editImage")}
      onClick={onClose}
    >
      <div
        className="flex min-h-0 flex-1 flex-col gap-2 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 text-white">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">{image.labelHe}</p>
          <OsIconButton label={t("workspaceWidgets.floorplanViz.closePreview")} size="sm" onClick={onClose}>
            <X size={16} className="text-white" />
          </OsIconButton>
        </div>
        <p className="shrink-0 text-[11px] text-white/80">{t("workspaceWidgets.floorplanViz.markRegionHint")}</p>
        <form
          className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/70 p-2 backdrop-blur-sm"
          onSubmit={(e) => {
            e.preventDefault();
            const text = instruction.trim();
            if (!text || busy) return;
            onSubmit(text, region ?? undefined);
          }}
        >
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={busy}
            className="min-w-0 flex-1 rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-sm text-white"
            placeholder={t("workspaceWidgets.floorplanViz.editImagePh")}
            aria-label={t("workspaceWidgets.floorplanViz.editImage")}
            autoFocus
          />
          {region ? (
            <OsButton type="button" variant="secondary" size="sm" disabled={busy} onClick={() => setRegion(null)}>
              {t("workspaceWidgets.floorplanViz.clearMark")}
            </OsButton>
          ) : null}
          <OsButton
            type="submit"
            variant="primary"
            size="sm"
            loading={busy}
            disabled={busy || !instruction.trim()}
            icon={<Pencil size={14} aria-hidden />}
          >
            {t("workspaceWidgets.floorplanViz.applyEdit")}
          </OsButton>
        </form>
        <div
          ref={wrapRef}
          className={`relative min-h-0 flex-1 overflow-hidden rounded-xl bg-neutral-950 ${busy ? "cursor-wait" : "cursor-crosshair"}`}
          onPointerDown={onPointer}
          onPointerMove={onPointer}
          onPointerUp={onPointer}
          onPointerCancel={onPointer}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={src}
            alt={image.labelHe}
            draggable={false}
            onLoad={measureFrame}
            className="pointer-events-none h-full w-full select-none object-contain"
          />
          {overlayStyle ? (
            <div
              className="pointer-events-none absolute border-2 border-fuchsia-400 bg-fuchsia-400/20"
              style={overlayStyle}
            />
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
