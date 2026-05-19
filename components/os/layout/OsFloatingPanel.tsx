"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import WorkspaceWindowChrome from "@/components/os/layout/WorkspaceWindowChrome";

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
  zIndex = 1260,
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
    <AnimatePresence mode="wait" onExitComplete={onExitComplete}>
      {open ? (
        <>
          <motion.button
            key="os-floating-panel-backdrop"
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
          <motion.div
            key="os-floating-panel-dialog"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", damping: 28, stiffness: 340 }}
            className={`${panelClass} workspace-window workspace-window--focused fixed flex flex-col overflow-hidden ${className}`}
            style={panelStyle}
            dir={dir}
          >
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
              onMaximize={() => setIsMaximized((m) => !m)}
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

/** ממתין לסיום אנימציית סגירה של פאנל צף לפני מעבר תצוגה שמפרקת את ההורה */
export function waitForFloatingPanelExit(ms = EXIT_MS): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
