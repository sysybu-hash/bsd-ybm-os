import React from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import WorkspaceWindowChrome from "@/components/os/layout/WorkspaceWindowChrome";
import { useAdaptiveShellDragResize } from "./adaptive-shell/useAdaptiveShellDragResize";
import { ResizeHandles } from "./adaptive-shell/ResizeHandles";

interface ShellProps {
  id: string;
  title: string;
  onClose: () => void;
  initialOffset?: { x: number; y: number };
  size?: { width: number; height: number };
  zIndex?: number;
  isFocused?: boolean;
  isMaximized?: boolean;
  zoom?: number;
  onFocus?: () => void;
  onPositionChange?: (position: { x: number; y: number }) => void;
  onResize?: (size: { width: number; height: number }) => void;
  onMaximize?: () => void;
  onMinimize?: () => void;
  isMinimized?: boolean;
  onZoomChange?: (delta: number) => void;
  /** אזור העבודה (מתחת לכותרת, מעל ה־Omnibar) — גבולות גרירה/גודל יחושבו ממנו */
  workspaceBoundsRef?: React.RefObject<HTMLElement | null>;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onBack?: () => void;
  onForward?: () => void;
  maximizeHiddenOnMobile?: boolean;
  children: React.ReactNode;
}

export default function AdaptiveWidgetShell({
  id,
  title,
  onClose,
  initialOffset,
  size = { width: 600, height: 450 },
  zIndex = 10,
  isFocused = false,
  isMaximized = false,
  zoom = 1,
  onFocus,
  onPositionChange,
  onResize,
  onMaximize,
  onMinimize,
  isMinimized = false,
  onZoomChange,
  workspaceBoundsRef,
  canGoBack = false,
  canGoForward = false,
  onBack,
  onForward,
  maximizeHiddenOnMobile = false,
  children,
}: ShellProps) {
  const { dir } = useI18n();

  const {
    mobileOrMaximized,
    currentSize, position,
    setIsDragging,
    ws, clampedLeft, clampedTop,
    shellRef, dragStartRef,
    startResize,
    zoomActive, contentZoomStyle,
  } = useAdaptiveShellDragResize({
    initialOffset, size, isMaximized, workspaceBoundsRef,
    zoom, dir, onPositionChange, onResize,
  });

  return (
    <section
      data-widget-shell
      data-scroll-owner="shell"
      ref={shellRef as React.RefObject<HTMLElement>}
      id={id}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        onFocus?.();
      }}
      className={`workspace-window pointer-events-auto transition-[box-shadow,border-color,transform] duration-200 ${
        isFocused && !mobileOrMaximized ? "workspace-window--focused" : ""
      } ${
        mobileOrMaximized
          ? "workspace-window--mobile flex min-h-0 flex-col fixed inset-x-0 top-[var(--workspace-inset-top)] bottom-[var(--workspace-inset-bottom)] !h-auto !max-h-none !w-full !max-w-[100dvw] !rounded-none !shadow-none"
          : "absolute max-w-[100dvw]"
      }`}
      style={
        mobileOrMaximized
          ? { zIndex, display: isMinimized ? "none" : undefined }
          : {
              width: `${currentSize.width}px`,
              height: `${currentSize.height}px`,
              maxWidth: `${ws.width}px`,
              maxHeight: `${ws.height}px`,
              left: `${clampedLeft}px`,
              top: `${clampedTop}px`,
              zIndex,
              display: isMinimized ? "none" : undefined,
            }
      }
      dir={dir}
      aria-hidden={isMinimized || undefined}
      aria-labelledby={`${id}-title`}
    >
      {/* Content wrapper — overflow-hidden here clips content to rounded corners
          but ResizeHandles lives OUTSIDE this div so it is never clipped. */}
      <div
        data-window-body
        className={
          mobileOrMaximized
            ? "relative flex min-h-0 flex-1 flex-col overflow-hidden overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
            : "absolute inset-0 flex min-h-0 flex-col overflow-hidden rounded-[inherit]"
        }
      >
        <WorkspaceWindowChrome
          title={title}
          titleId={`${id}-title`}
          onClose={onClose}
          zoom={zoom}
          onZoomDelta={(delta) => onZoomChange?.(delta)}
          isMaximized={isMaximized}
          onMaximize={onMaximize}
          onMinimize={onMinimize}
          isMinimized={isMinimized}
          maximizeHiddenOnMobile={maximizeHiddenOnMobile}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onBack={onBack}
          onForward={onForward}
          closeTouchTarget={mobileOrMaximized}
          headerClassName={
            mobileOrMaximized
              ? "cursor-default pt-[max(0.5rem,env(safe-area-inset-top))] sticky top-0 z-20 bg-[color:var(--surface-card)]"
              : "cursor-move touch-none"
          }
          onHeaderMouseDown={(e) => {
            if (mobileOrMaximized) return;
            if ((e.target as HTMLElement).closest("button")) return;
            e.preventDefault();
            dragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, x: position.x, y: position.y };
            setIsDragging(true);
          }}
        />

        <div className={`flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent text-[color:var(--foreground-main)] ${mobileOrMaximized ? "flex-none overflow-visible" : ""}`}>
          <div
            data-shell-scroll
            className={`shell-scroll-host custom-scrollbar min-h-0 flex-1 h-0 ${mobileOrMaximized ? "min-h-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]" : "md:pb-0"} [-webkit-overflow-scrolling:touch] [touch-action:pan-y] ${
              zoomActive ? "overflow-auto" : "overflow-y-auto overflow-x-hidden"
            }`}
          >
            {/* Stable wrapper — never unmounts when zoom toggles, preventing widget remount */}
            <div
              data-shell-content
              className={`flex w-full flex-col ${zoomActive ? "origin-top" : ""}`}
              style={zoomActive ? contentZoomStyle : undefined}
            >
              {children}
            </div>
          </div>
        </div>
      </div>

      {/* Resize handles are OUTSIDE the overflow-hidden wrapper so they are
          never clipped, and their z-[100] sits above all widget content. */}
      {!mobileOrMaximized && <ResizeHandles onStartResize={startResize} />}
    </section>
  );
}
