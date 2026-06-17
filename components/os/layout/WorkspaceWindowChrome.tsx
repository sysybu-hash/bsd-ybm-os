"use client";

import React, { useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Minus, X, ZoomIn, ZoomOut } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";

export type WorkspaceWindowChromeProps = {
  title: string;
  titleId: string;
  onClose: () => void;
  headerStart?: React.ReactNode;
  /** גרירה — mouse (ווידג'ט) או pointer (פאנל צף) */
  onHeaderMouseDown?: (e: React.MouseEvent<HTMLElement>) => void;
  onHeaderPointerDown?: (e: React.PointerEvent<HTMLElement>) => void;
  onHeaderPointerMove?: (e: React.PointerEvent<HTMLElement>) => void;
  onHeaderPointerUp?: (e: React.PointerEvent<HTMLElement>) => void;
  headerClassName?: string;
  showZoom?: boolean;
  zoom?: number;
  onZoomDelta?: (delta: number) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  showMaximize?: boolean;
  isMaximized?: boolean;
  onMaximize?: () => void;
  maximizeHiddenOnMobile?: boolean;
  onMinimize?: () => void;
  isMinimized?: boolean;
  closeTouchTarget?: boolean;
  showNavigation?: boolean;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onBack?: () => void;
  onForward?: () => void;
};

export default function WorkspaceWindowChrome({
  title,
  titleId,
  onClose,
  headerStart,
  onHeaderMouseDown,
  onHeaderPointerDown,
  onHeaderPointerMove,
  onHeaderPointerUp,
  headerClassName = "",
  showZoom = true,
  zoom = 1,
  onZoomDelta,
  onZoomIn,
  onZoomOut,
  showMaximize = true,
  isMaximized = false,
  onMaximize,
  maximizeHiddenOnMobile = false,
  onMinimize,
  isMinimized = false,
  closeTouchTarget = false,
  showNavigation = true,
  canGoBack = false,
  canGoForward = false,
  onBack,
  onForward,
}: WorkspaceWindowChromeProps) {
  const { t, dir } = useI18n();
  const chromeTitle = { title };
  const closeActivatedRef = useRef(false);

  const handleClose = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (closeActivatedRef.current) return;
      closeActivatedRef.current = true;
      window.setTimeout(() => {
        closeActivatedRef.current = false;
      }, 400);
      onClose();
    },
    [onClose],
  );

  const handleZoomOut = () => {
    if (onZoomOut) onZoomOut();
    else onZoomDelta?.(-0.1);
  };

  const handleZoomIn = () => {
    if (onZoomIn) onZoomIn();
    else onZoomDelta?.(0.1);
  };

  const touchChromeBtn = closeTouchTarget
    ? "workspace-chrome-btn inline-flex min-h-11 min-w-11 md:min-h-8 md:min-w-8"
    : "workspace-chrome-btn inline-flex min-h-9 min-w-9";

  const closeBtnClass = `${touchChromeBtn} workspace-chrome-btn--danger`;

  const minimizeBtnClass = touchChromeBtn;

  // On mobile, windows already fill the screen, so the maximize toggle is
  // redundant — always hide it on mobile (shown from md up).
  const maximizeBtnClass = "workspace-chrome-btn hidden md:inline-flex";
  void maximizeHiddenOnMobile;

  const BackIcon = dir === "rtl" ? ChevronRight : ChevronLeft;
  const ForwardIcon = dir === "rtl" ? ChevronLeft : ChevronRight;

  return (
    <header
      className={`workspace-window-header ${headerClassName}`.trim()}
      onMouseDown={onHeaderMouseDown}
      onPointerDown={onHeaderPointerDown}
      onPointerMove={onHeaderPointerMove}
      onPointerUp={onHeaderPointerUp}
      onPointerCancel={onHeaderPointerUp}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {showNavigation && closeTouchTarget ? (
          <div className="flex shrink-0 items-center md:hidden">
            <button
              type="button"
              onClick={onBack}
              className={touchChromeBtn}
              aria-label={t("workspaceWidgets.chrome.backAria", chromeTitle)}
            >
              <BackIcon size={18} aria-hidden />
            </button>
          </div>
        ) : null}
        {showNavigation && !closeTouchTarget ? (
          <div className="hidden shrink-0 items-center gap-0.5 sm:flex">
            <button
              type="button"
              onClick={onBack}
              disabled={!canGoBack}
              className="workspace-chrome-btn inline-flex disabled:opacity-35"
              aria-label={t("workspaceWidgets.chrome.backAria", chromeTitle)}
            >
              <BackIcon size={16} aria-hidden />
            </button>
            <button
              type="button"
              onClick={onForward}
              disabled={!canGoForward}
              className="workspace-chrome-btn inline-flex disabled:opacity-35"
              aria-label={t("workspaceWidgets.chrome.forwardAria", chromeTitle)}
            >
              <ForwardIcon size={16} aria-hidden />
            </button>
          </div>
        ) : null}
        {headerStart}
        <h2 id={titleId} className="workspace-window-title">
          {title}
        </h2>
      </div>

      <div
        className="workspace-chrome-toolbar"
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {showZoom ? (
          <div className="inline-flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={handleZoomOut}
              className={touchChromeBtn}
              aria-label={t("workspaceWidgets.chrome.zoomOutAria", chromeTitle)}
            >
              <ZoomOut size={closeTouchTarget ? 16 : 14} aria-hidden />
            </button>
            <span
              className={`workspace-chrome-zoom ${closeTouchTarget ? "min-w-[2.25rem] text-[10px]" : ""}`}
              aria-live="polite"
              aria-atomic="true"
            >
              {t("workspaceWidgets.chrome.zoomLevel", { level: String(Math.round(zoom * 100)) })}
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              className={touchChromeBtn}
              aria-label={t("workspaceWidgets.chrome.zoomInAria", chromeTitle)}
            >
              <ZoomIn size={closeTouchTarget ? 16 : 14} aria-hidden />
            </button>
          </div>
        ) : null}
        {onMinimize ? (
          <button
            type="button"
            onClick={onMinimize}
            className={minimizeBtnClass}
            aria-label={
              isMinimized
                ? t("workspaceWidgets.chrome.restoreMinimizedAria", chromeTitle)
                : t("workspaceWidgets.chrome.minimizeAria", chromeTitle)
            }
          >
            <Minus size={15} aria-hidden />
          </button>
        ) : null}
        {showMaximize && onMaximize ? (
          <button
            type="button"
            onClick={onMaximize}
            className={maximizeBtnClass}
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
          onClick={handleClose}
          onPointerUp={(e) => {
            if (e.pointerType === "mouse") return;
            if (e.button !== 0) return;
            handleClose(e);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") handleClose(e);
          }}
          className={`${closeBtnClass} relative z-[130] touch-manipulation`}
          aria-label={t("workspaceWidgets.chrome.closeAria", chromeTitle)}
        >
          <X size={16} className="shrink-0 md:h-[15px] md:w-[15px]" aria-hidden />
        </button>
      </div>
    </header>
  );
}
