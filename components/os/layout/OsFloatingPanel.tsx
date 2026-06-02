"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import WorkspaceWindowChrome from "@/components/os/layout/WorkspaceWindowChrome";
import { OS_MODAL_BACKDROP_Z, OS_MODAL_PANEL_Z } from "@/lib/os-modal-z-index";

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
  /** נקרא אחרי סיום אנימציית סגירה (backdrop + דיאלוג) */
  onExitComplete?: () => void;
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
export const FLOATING_PANEL_EXIT_MS = 220;
const EXIT_MS = FLOATING_PANEL_EXIT_MS;

export default function OsFloatingPanel({
  open,
  onClose,
  title,
  titleId = "os-floating-panel-title",
  children,
  className = "",
  zIndex = OS_MODAL_PANEL_Z,
  panelWidth = 560,
  headerStart,
  footer,
  draggable = true,
  showZoom = true,
  showMaximize = true,
  onExitComplete,
}: OsFloatingPanelProps) {
  const { t, dir } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const backdropZ = zIndex > OS_MODAL_BACKDROP_Z ? zIndex - 10 : OS_MODAL_BACKDROP_Z;

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
    setIsMinimized(false);
  }, [open]);

  useEffect(() => {
    return () => {
      document.body.style.overflow = "";
      document
        .querySelectorAll("[data-os-floating-panel-backdrop]")
        .forEach((el) => el.remove());
    };
  }, []);

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
      const first = list[0]!;
      const last = list[list.length - 1]!;
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

  const panelClass = isMaximized
    ? "os-floating-panel os-floating-panel--maximized"
    : "os-floating-panel os-modal-dialog";

  const panelSurfaceClass = `${panelClass} workspace-window workspace-window--focused flex flex-col overflow-hidden bg-[color:var(--surface-card)] ${className}`;

  const panelBody = (
    <>
      <WorkspaceWindowChrome
        title={title}
        titleId={titleId}
        onClose={onClose}
        headerStart={headerStart}
        showZoom={showZoom}
        zoom={zoom}
        onZoomIn={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.1))}
        onZoomOut={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.1))}
        showMaximize={showMaximize}
        isMaximized={isMaximized}
        onMaximize={() => {
          setIsMinimized(false);
          setIsMaximized((m) => !m);
        }}
        onMinimize={() => {
          setIsMinimized(true);
          setIsMaximized(false);
        }}
        isMinimized={isMinimized}
        closeTouchTarget
        canGoBack
        canGoForward={false}
        onBack={onClose}
        maximizeHiddenOnMobile={false}
        headerClassName={
          draggable && !isMaximized ? "cursor-move touch-none" : "cursor-default"
        }
        onHeaderPointerDown={onHeaderPointerDown}
        onHeaderPointerMove={onHeaderPointerMove}
        onHeaderPointerUp={onHeaderPointerUp}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <motion.div
            className={`flex min-h-full w-full flex-col ${zoomActive ? "origin-top" : ""}`}
            style={contentZoomStyle}
          >
            {children}
          </motion.div>
        </div>
      </div>

      {footer ? (
        <div className="shrink-0 border-t border-[color:var(--border-main)] px-4 py-3">{footer}</div>
      ) : null}
    </>
  );

  if (open && isMinimized) {
    return createPortal(
      <AnimatePresence onExitComplete={onExitComplete}>
        <motion.div
          key="os-floating-panel-minimized"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="pointer-events-auto fixed start-1/2 -translate-x-1/2 workspace-minimized-chip flex items-center gap-1 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/95 shadow-lg backdrop-blur-md max-w-[min(100vw-1rem,24rem)]"
          style={{
            zIndex,
            bottom: "calc(var(--minimized-dock-bottom, 5.75rem) + env(safe-area-inset-bottom, 0px))",
          }}
          dir={dir}
        >
          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            className="px-4 py-2.5 text-xs font-bold text-[color:var(--foreground-main)] hover:bg-[color:var(--surface-soft)] rounded-s-xl min-h-11"
          >
            {title}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="workspace-chrome-btn workspace-chrome-btn--danger inline-flex min-h-11 min-w-11 rounded-e-xl border-s border-[color:var(--border-main)]/50"
            aria-label={t("workspaceWidgets.chrome.closeAria", { title })}
          >
            <X size={14} aria-hidden />
          </button>
        </motion.div>
      </AnimatePresence>,
      document.body,
    );
  }

  return createPortal(
    <AnimatePresence onExitComplete={onExitComplete}>
      {open ? (
        <div
          key="os-floating-panel-overlay"
          className="fixed inset-0 isolate"
          style={{ zIndex }}
          dir={dir}
        >
          <motion.button
            type="button"
            data-os-floating-panel-backdrop
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: EXIT_MS / 1000 }}
            className="fixed inset-0 bg-black/45"
            style={{ zIndex: backdropZ }}
            aria-label={t("workspaceWidgets.chrome.closeLabel")}
            onClick={onClose}
          />

          {isMaximized ? (
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", damping: 28, stiffness: 340 }}
              className={`${panelSurfaceClass} fixed flex flex-col overflow-hidden`}
              style={{ zIndex }}
            >
              {panelBody}
            </motion.div>
          ) : (
            <div
              className="pointer-events-none fixed inset-0 flex items-center justify-center p-2 sm:p-4"
              style={{ zIndex }}
            >
              <div
                className="pointer-events-auto w-full max-w-[calc(100vw-1rem)]"
                style={{
                  width: `min(calc(100vw - 1.25rem), ${panelWidth}px)`,
                  transform: `translate(${offset.x}px, ${offset.y}px)`,
                }}
              >
                <motion.div
                  ref={panelRef}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={titleId}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ type: "spring", damping: 28, stiffness: 340 }}
                  className={`${panelSurfaceClass} max-h-[min(88dvh,calc(100dvh-var(--mobile-chrome-bottom,5.5rem)-1.25rem))]`}
                >
                  {panelBody}
                </motion.div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

/** ממתין לסיום אנימציית סגירה של פאנל צף לפני מעבר תצוגה שמפרקת את ההורה */
export function waitForFloatingPanelExit(ms = EXIT_MS): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
