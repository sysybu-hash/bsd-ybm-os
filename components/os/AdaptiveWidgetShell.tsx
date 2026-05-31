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
      ref={shellRef as React.RefObject<HTMLElement>}
      id={id}
      onMouseDown={onFocus}
      className={`workspace-window pointer-events-auto flex min-h-0 flex-col overflow-hidden transition-[box-shadow,border-color,transform] duration-200 ${
        isFocused && !mobileOrMaximized ? "workspace-window--focused" : ""
      } ${
        mobileOrMaximized
          ? "workspace-window--mobile fixed inset-x-0 top-[var(--workspace-inset-top)] bottom-[var(--workspace-inset-bottom)] !z-[950] !h-auto !max-h-none !w-full !max-w-[100dvw] !rounded-none !shadow-none md:absolute md:inset-0 md:!top-0 md:!bottom-0 md:!h-full md:!max-h-full"
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
            ? "cursor-default pt-[max(0.5rem,env(safe-area-inset-top))]"
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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent text-[color:var(--foreground-main)]">
        {mobileOrMaximized ? (
          /* ── Mobile: children rendered directly in the scroll container.
             • Content widgets (min-h-full at root) grow past screen → parent scrolls.
             • Frame widgets (h-full at root) reference THIS container's defined
               flex height → fill screen exactly, with their own internal scroll. ── */
          <div
            className={`custom-scrollbar flex-1 min-h-0 overscroll-y-contain pb-[max(0.75rem,env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch] ${
              zoomActive ? "overflow-auto" : "overflow-y-auto overflow-x-hidden"
            }`}
          >
            {zoomActive ? (
              <div className="min-h-full origin-top" style={contentZoomStyle}>
                {children}
              </div>
            ) : children}
          </div>
        ) : (
          /* ── Desktop: original nested structure with h-full content wrapper ── */
          <div
            className={`custom-scrollbar min-h-0 flex-1 overscroll-y-contain md:pb-0 ${
              zoomActive ? "overflow-auto" : "overflow-y-auto overflow-x-hidden"
            }`}
          >
            <div
              className={`flex w-full flex-col ${zoomActive ? "min-h-full origin-top" : "h-full"}`}
              style={contentZoomStyle}
            >
              {children}
            </div>
          </div>
        )}
      </div>

      {!mobileOrMaximized && <ResizeHandles onStartResize={startResize} />}
    </section>
  );
}
