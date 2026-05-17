"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, Minimize2, X, ZoomIn, ZoomOut } from "lucide-react";

export type OsFloatingPanelProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  titleId?: string;
  children: React.ReactNode;
  className?: string;
  zIndex?: number;
  /** רוחב ברירת מחדל (px) כשלא במסך מלא */
  panelWidth?: number;
  /** כותרת משנה / אייקון ליד הכותרת */
  headerStart?: React.ReactNode;
  /** פס פעולות תחתון (שמור, איפוס וכו') */
  footer?: React.ReactNode;
  draggable?: boolean;
  showZoom?: boolean;
  showMaximize?: boolean;
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;

export default function OsFloatingPanel({
  open,
  onClose,
  title,
  titleId = "os-floating-panel-title",
  children,
  className = "",
  zIndex = 1260,
  panelWidth = 560,
  headerStart,
  footer,
  draggable = true,
  showZoom = true,
  showMaximize = true,
}: OsFloatingPanelProps) {
  const { t, dir } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isMaximized, setIsMaximized] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const FOCUSABLE =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) return;
    setOffset({ x: 0, y: 0 });
    setZoom(1);
    setIsMaximized(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const root = panelRef.current;
    const nodes = () =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
    nodes()[0]?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = nodes();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    root.addEventListener("keydown", onKeyDown);
    return () => root.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!draggable || isMaximized) return;
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [draggable, isMaximized, offset.x, offset.y],
  );

  const onHeaderPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    const d = dragRef.current;
    setOffset({
      x: d.ox + (e.clientX - d.startX),
      y: d.oy + (e.clientY - d.startY),
    });
  }, []);

  const onHeaderPointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* */
    }
  }, []);

  const chromeTitle = { title };
  const zoomOrigin = dir === "rtl" ? "top right" : "top left";
  const zoomActive = Math.abs(zoom - 1) > 0.001;
  const contentZoomStyle = zoomActive
    ? {
        transform: `scale(${zoom})`,
        transformOrigin: zoomOrigin,
        width: `${100 / zoom}%`,
      }
    : undefined;

  if (!mounted || typeof document === "undefined") return null;

  const backdropZ = zIndex - 10;

  const panelClass = isMaximized
    ? "os-floating-panel os-floating-panel--maximized"
    : "os-floating-panel os-modal-dialog";

  const panelStyle: React.CSSProperties = isMaximized
    ? { zIndex }
    : {
        zIndex,
        width: `min(calc(100vw - 1.25rem), ${panelWidth}px)`,
        left: `calc(50% + ${offset.x}px)`,
        top: `calc(50% + ${offset.y}px)`,
        transform: "translate(-50%, -50%)",
      };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/55 backdrop-blur-[3px]"
            style={{ zIndex: backdropZ }}
            aria-label={t("workspaceWidgets.chrome.closeLabel")}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", damping: 28, stiffness: 340 }}
            className={`${panelClass} fixed flex flex-col overflow-hidden rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--background-main)] shadow-2xl ${className}`}
            style={panelStyle}
            dir={dir}
          >
            <header
              className={`workspace-window-header flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--border-main)] px-3 py-2.5 ${
                draggable && !isMaximized ? "cursor-move touch-none" : "cursor-default"
              }`}
              onPointerDown={onHeaderPointerDown}
              onPointerMove={onHeaderPointerMove}
              onPointerUp={onHeaderPointerUp}
              onPointerCancel={onHeaderPointerUp}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {headerStart}
                <h2
                  id={titleId}
                  className="truncate text-sm font-black text-[color:var(--foreground-main)]"
                >
                  {title}
                </h2>
              </div>

              <div className="workspace-chrome-toolbar shrink-0">
                {showZoom ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.1))}
                      className="workspace-chrome-btn inline-flex"
                      aria-label={t("workspaceWidgets.chrome.zoomOutAria", chromeTitle)}
                    >
                      <ZoomOut size={14} aria-hidden />
                    </button>
                    <span className="workspace-chrome-zoom inline" aria-live="polite">
                      {t("workspaceWidgets.chrome.zoomLevel", {
                        level: String(Math.round(zoom * 100)),
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.1))}
                      className="workspace-chrome-btn inline-flex"
                      aria-label={t("workspaceWidgets.chrome.zoomInAria", chromeTitle)}
                    >
                      <ZoomIn size={14} aria-hidden />
                    </button>
                  </>
                ) : null}
                {showMaximize ? (
                  <button
                    type="button"
                    onClick={() => setIsMaximized((m) => !m)}
                    className="workspace-chrome-btn inline-flex"
                    aria-label={
                      isMaximized
                        ? t("workspaceWidgets.chrome.restoreAria", chromeTitle)
                        : t("workspaceWidgets.chrome.maximizeAria", chromeTitle)
                    }
                  >
                    {isMaximized ? <Minimize2 size={15} aria-hidden /> : <Maximize2 size={15} aria-hidden />}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  className="workspace-chrome-btn workspace-chrome-btn--danger inline-flex min-h-9 min-w-9"
                  aria-label={t("workspaceWidgets.chrome.closeAria", chromeTitle)}
                >
                  <X size={16} aria-hidden />
                </button>
              </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <div
                  className={`flex min-h-full w-full flex-col ${zoomActive ? "origin-top" : "h-full min-h-0"}`}
                  style={contentZoomStyle}
                >
                  {children}
                </div>
              </div>
            </div>

            {footer ? (
              <div className="shrink-0 border-t border-[color:var(--border-main)] px-4 py-3">{footer}</div>
            ) : null}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
