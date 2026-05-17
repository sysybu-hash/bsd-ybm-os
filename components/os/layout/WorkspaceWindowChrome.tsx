"use client";

import React from "react";
import { Maximize2, Minimize2, X, ZoomIn, ZoomOut } from "lucide-react";
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
  closeTouchTarget?: boolean;
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
  closeTouchTarget = false,
}: WorkspaceWindowChromeProps) {
  const { t } = useI18n();
  const chromeTitle = { title };

  const handleZoomOut = () => {
    if (onZoomOut) onZoomOut();
    else onZoomDelta?.(-0.1);
  };

  const handleZoomIn = () => {
    if (onZoomIn) onZoomIn();
    else onZoomDelta?.(0.1);
  };

  const closeBtnClass = closeTouchTarget
    ? "workspace-chrome-btn workspace-chrome-btn--danger inline-flex min-h-11 min-w-11 md:min-h-8 md:min-w-8"
    : "workspace-chrome-btn workspace-chrome-btn--danger inline-flex min-h-9 min-w-9";

  const maximizeBtnClass = maximizeHiddenOnMobile
    ? "workspace-chrome-btn hidden md:inline-flex"
    : "workspace-chrome-btn inline-flex";

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
        {headerStart}
        <h2 id={titleId} className="workspace-window-title">
          {title}
        </h2>
      </div>

      <div className="workspace-chrome-toolbar">
        {showZoom ? (
          <>
            <button
              type="button"
              onClick={handleZoomOut}
              className="workspace-chrome-btn inline-flex"
              aria-label={t("workspaceWidgets.chrome.zoomOutAria", chromeTitle)}
            >
              <ZoomOut size={14} aria-hidden />
            </button>
            <span className="workspace-chrome-zoom" aria-live="polite" aria-atomic="true">
              {t("workspaceWidgets.chrome.zoomLevel", { level: String(Math.round(zoom * 100)) })}
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              className="workspace-chrome-btn inline-flex"
              aria-label={t("workspaceWidgets.chrome.zoomInAria", chromeTitle)}
            >
              <ZoomIn size={14} aria-hidden />
            </button>
          </>
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
          onClick={onClose}
          className={closeBtnClass}
          aria-label={t("workspaceWidgets.chrome.closeAria", chromeTitle)}
        >
          <X size={16} className="shrink-0 md:h-[15px] md:w-[15px]" aria-hidden />
        </button>
      </div>
    </header>
  );
}
