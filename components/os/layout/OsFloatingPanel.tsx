"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import WorkspaceWindowChrome from "@/components/os/layout/WorkspaceWindowChrome";
import { OS_MODAL_BACKDROP_Z, OS_MODAL_PANEL_Z } from "@/lib/os-modal-z-index";
import { usePanelDrag } from "./usePanelDrag";
import { useFocusTrap } from "./useFocusTrap";

export type OsFloatingPanelProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  titleId?: string;
  children: React.ReactNode;
  className?: string;
  zIndex?: number;
  panelWidth?: number;
  headerStart?: React.ReactNode;
  footer?: React.ReactNode;
  draggable?: boolean;
  showZoom?: boolean;
  showMaximize?: boolean;
  onExitComplete?: () => void;
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
export const FLOATING_PANEL_EXIT_MS = 220;
const EXIT_MS = FLOATING_PANEL_EXIT_MS;

export default function OsFloatingPanel({
  open, onClose, title, titleId = "os-floating-panel-title", children,
  className = "", zIndex = OS_MODAL_PANEL_Z, panelWidth = 560,
  headerStart, footer, draggable = true, showZoom = true, showMaximize = true,
  onExitComplete,
}: OsFloatingPanelProps) {
  const { t, dir } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { offset, reset: resetOffset, onHeaderPointerDown, onHeaderPointerMove, onHeaderPointerUp } =
    usePanelDrag(isMaximized, draggable);

  useFocusTrap(panelRef, open && !isMinimized);

  const backdropZ = zIndex > OS_MODAL_BACKDROP_Z ? zIndex - 10 : OS_MODAL_BACKDROP_Z;

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    return () => { document.body.style.overflow = ""; document.querySelectorAll("[data-os-floating-panel-backdrop]").forEach((el) => el.remove()); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (open) return;
    resetOffset();
    setZoom(1);
    setIsMaximized(false);
    setIsMinimized(false);
  }, [open, resetOffset]);

  const zoomOrigin = dir === "rtl" ? "top right" : "top left";
  const zoomActive = Math.abs(zoom - 1) > 0.001;
  const contentZoomStyle = zoomActive
    ? { transform: `scale(${zoom})`, transformOrigin: zoomOrigin, width: `${100 / zoom}%` }
    : undefined;

  if (!mounted || typeof document === "undefined") return null;

  const panelClass = isMaximized ? "os-floating-panel os-floating-panel--maximized" : "os-floating-panel os-modal-dialog";
  const panelSurfaceClass = `${panelClass} workspace-window workspace-window--focused flex flex-col overflow-hidden bg-[color:var(--surface-card)] ${className}`;

  const panelBody = (
    <>
      <WorkspaceWindowChrome
        title={title} titleId={titleId} onClose={onClose} headerStart={headerStart}
        showZoom={showZoom} zoom={zoom}
        onZoomIn={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.1))}
        onZoomOut={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.1))}
        showMaximize={showMaximize} isMaximized={isMaximized}
        onMaximize={() => { setIsMinimized(false); setIsMaximized((m) => !m); }}
        onMinimize={() => { setIsMinimized(true); setIsMaximized(false); }}
        isMinimized={isMinimized} closeTouchTarget canGoBack canGoForward={false} onBack={onClose}
        maximizeHiddenOnMobile={false}
        headerClassName={draggable && !isMaximized ? "cursor-move touch-none" : "cursor-default"}
        onHeaderPointerDown={onHeaderPointerDown}
        onHeaderPointerMove={onHeaderPointerMove}
        onHeaderPointerUp={onHeaderPointerUp}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          data-shell-scroll
          className="shell-scroll-host custom-scrollbar min-h-0 flex-1 h-0 max-md:min-h-0 overflow-y-auto overflow-x-hidden p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-0 [-webkit-overflow-scrolling:touch] [touch-action:pan-y]"
        >
          <motion.div
            data-shell-content
            className={`flex w-full flex-col ${zoomActive ? "origin-top" : ""}`}
            style={contentZoomStyle}
          >
            {children}
          </motion.div>
        </div>
      </div>
      {footer ? <div className="shrink-0 border-t border-[color:var(--border-main)] px-4 py-3">{footer}</div> : null}
    </>
  );

  if (open && isMinimized) {
    return createPortal(
      <AnimatePresence onExitComplete={onExitComplete}>
        <motion.div key="os-floating-panel-minimized"
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
          className="pointer-events-auto fixed start-1/2 -translate-x-1/2 workspace-minimized-chip flex items-center gap-1 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/95 shadow-lg backdrop-blur-md max-w-[min(100vw-1rem,24rem)]"
          style={{ zIndex, bottom: "calc(var(--minimized-dock-bottom, 5.75rem) + env(safe-area-inset-bottom, 0px))" }}
          dir={dir}
        >
          <button type="button" onClick={() => setIsMinimized(false)}
            className="min-h-11 rounded-s-xl px-4 py-2.5 text-xs font-bold text-[color:var(--foreground-main)] hover:bg-[color:var(--surface-soft)]">
            {title}
          </button>
          <button type="button" onClick={onClose}
            className="workspace-chrome-btn workspace-chrome-btn--danger inline-flex min-h-11 min-w-11 rounded-e-xl border-s border-[color:var(--border-main)]/50"
            aria-label={t("workspaceWidgets.chrome.closeAria", { title })}>
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
        <div key="os-floating-panel-overlay" className="fixed inset-0 isolate" style={{ zIndex }} dir={dir}>
          <motion.button type="button" data-os-floating-panel-backdrop
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: EXIT_MS / 1000 }}
            className="fixed inset-0 bg-black/45" style={{ zIndex: backdropZ }}
            aria-label={t("workspaceWidgets.chrome.closeLabel")} onClick={onClose}
          />
          {isMaximized ? (
            <motion.div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
              initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", damping: 28, stiffness: 340 }}
              className={`${panelSurfaceClass} fixed flex flex-col overflow-hidden`} style={{ zIndex }}>
              {panelBody}
            </motion.div>
          ) : (
            <div className="pointer-events-none fixed inset-0 flex items-center justify-center p-2 sm:p-4" style={{ zIndex }}>
              <div className="pointer-events-auto w-full max-w-[calc(100vw-1rem)]"
                style={{ width: `min(calc(100vw - 1.25rem), ${panelWidth}px)`, transform: `translate(${offset.x}px, ${offset.y}px)` }}>
                <motion.div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
                  initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ type: "spring", damping: 28, stiffness: 340 }}
                  className={`${panelSurfaceClass} max-h-[var(--window-max-h)]`}>
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

export function waitForFloatingPanelExit(ms = EXIT_MS): Promise<void> {
  return new Promise((resolve) => { window.setTimeout(resolve, ms); });
}
