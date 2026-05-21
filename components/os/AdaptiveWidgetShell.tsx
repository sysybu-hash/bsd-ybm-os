import React, { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import WorkspaceWindowChrome from "@/components/os/layout/WorkspaceWindowChrome";
import {
  RESIZE_MIN_WINDOW_HEIGHT,
  RESIZE_MIN_WINDOW_WIDTH,
  resolveShellDesktopDimensions,
} from "@/lib/workspace/window-layout-policy";

type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

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

const SNAP_THRESHOLD = 24;

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

  const getViewportSize = () => ({
    width: typeof window !== "undefined" ? window.innerWidth : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  });

  const getWorkspaceSize = useCallback(() => {
    const el = workspaceBoundsRef?.current;
    if (el) {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        return { width: w, height: h };
      }
    }
    const v = getViewportSize();
    return { width: Math.max(320, v.width - 24), height: Math.max(400, v.height - 130) };
  }, [workspaceBoundsRef]);

  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768,
  );

  const resolveDesktopDimensions = useCallback(
    (ws: { width: number; height: number }) => resolveShellDesktopDimensions(ws, size),
    [size],
  );

  const resizeMinWidth = (wsWidth: number) =>
    isMobile ? Math.max(280, wsWidth) : Math.min(RESIZE_MIN_WINDOW_WIDTH, Math.max(320, wsWidth - 16));

  const getInitialPosition = (dim: { width: number; height: number }) => {
    if (isMobile || isMaximized) return { x: 0, y: 0 };
    if (initialOffset) return initialOffset;
    const ws = getWorkspaceSize();
    return {
      x: Math.max(0, Math.round(ws.width / 2 - dim.width / 2)),
      y: Math.max(0, Math.round(ws.height / 2 - dim.height / 2)),
    };
  };

  const [currentSize, setCurrentSize] = useState(() => {
    const ws = getWorkspaceSize();
    if (isMobile || isMaximized) {
      return { width: ws.width, height: ws.height };
    }
    return resolveDesktopDimensions(ws);
  });

  const [position, setPosition] = useState(() => getInitialPosition(currentSize));
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const positionRef = useRef(position);
  const sizeRef = useRef(currentSize);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, x: 0, y: 0 });
  const resizeStartRef = useRef({
    mouseX: 0,
    mouseY: 0,
    width: size.width,
    height: size.height,
    left: 0,
    top: 0,
    dir: "se" as ResizeHandle,
  });

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    sizeRef.current = currentSize;
  }, [currentSize]);

  useEffect(() => {
    const syncViewport = () => {
      const w = window.visualViewport?.width ?? window.innerWidth;
      setIsMobile(w < 768);
    };
    syncViewport();
    window.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("resize", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("resize", syncViewport);
    };
  }, []);

  const clampToWorkspace = useCallback(
    (pos: { x: number; y: number }, dim: { width: number; height: number }) => {
      const ws = getWorkspaceSize();
      const maxX = Math.max(0, ws.width - dim.width);
      const maxY = Math.max(0, ws.height - dim.height);
      return {
        x: Math.max(0, Math.min(pos.x, maxX)),
        y: Math.max(0, Math.min(pos.y, maxY)),
      };
    },
    [getWorkspaceSize],
  );

  const applySnap = useCallback(
    (pos: { x: number; y: number }, dim: { width: number; height: number }) => {
      const ws = getWorkspaceSize();
      const snapX =
        pos.x < SNAP_THRESHOLD
          ? 0
          : pos.x + dim.width > ws.width - SNAP_THRESHOLD
            ? Math.max(0, ws.width - dim.width)
            : pos.x;
      const snapY =
        pos.y < SNAP_THRESHOLD
          ? 0
          : pos.y + dim.height > ws.height - SNAP_THRESHOLD
            ? Math.max(0, ws.height - dim.height)
            : pos.y;
      return { x: snapX, y: snapY };
    },
    [getWorkspaceSize],
  );

  const moveWindow = useCallback(
    (clientX: number, clientY: number) => {
      const { mouseX, mouseY, x, y } = dragStartRef.current;
      const next = { x: x + clientX - mouseX, y: y + clientY - mouseY };
      const dim = sizeRef.current;
      setPosition(clampToWorkspace(next, dim));
    },
    [clampToWorkspace],
  );

  const resizeWindow = useCallback(
    (clientX: number, clientY: number) => {
      const { mouseX, mouseY, width: sw, height: sh, left: sl, top: st, dir } = resizeStartRef.current;
      const dx = clientX - mouseX;
      const dy = clientY - mouseY;

      let newW = sw;
      let newH = sh;
      let newL = sl;
      let newT = st;

      switch (dir) {
        case "se":
          newW = sw + dx;
          newH = sh + dy;
          break;
        case "s":
          newH = sh + dy;
          break;
        case "e":
          newW = sw + dx;
          break;
        case "nw":
          newW = sw - dx;
          newH = sh - dy;
          newL = sl + dx;
          newT = st + dy;
          break;
        case "n":
          newH = sh - dy;
          newT = st + dy;
          break;
        case "w":
          newW = sw - dx;
          newL = sl + dx;
          break;
        case "ne":
          newW = sw + dx;
          newH = sh - dy;
          newT = st + dy;
          break;
        case "sw":
          newW = sw - dx;
          newH = sh + dy;
          newL = sl + dx;
          break;
        default:
          break;
      }

      const wsForMin = getWorkspaceSize();
      newW = Math.max(resizeMinWidth(wsForMin.width), newW);
      newH = Math.max(RESIZE_MIN_WINDOW_HEIGHT, newH);

      const wsInner = getWorkspaceSize();
      newW = Math.min(newW, wsInner.width);
      newH = Math.min(newH, wsInner.height);

      if (dir === "nw" || dir === "w" || dir === "sw") {
        newL = sl + sw - newW;
      }
      if (dir === "nw" || dir === "n" || dir === "ne") {
        newT = st + sh - newH;
      }

      const clamped = clampToWorkspace({ x: newL, y: newT }, { width: newW, height: newH });
      if (clamped.x !== newL) {
        newW = Math.max(resizeMinWidth(wsInner.width), newW - (newL - clamped.x));
        newL = clamped.x;
      }
      if (clamped.y !== newT) {
        newH = Math.max(RESIZE_MIN_WINDOW_HEIGHT, newH - (newT - clamped.y));
        newT = clamped.y;
      }

      setPosition({ x: newL, y: newT });
      setCurrentSize({ width: newW, height: newH });
    },
    [clampToWorkspace, getWorkspaceSize],
  );

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMove = (e: MouseEvent) => {
      if (isDragging) moveWindow(e.clientX, e.clientY);
      if (isResizing) resizeWindow(e.clientX, e.clientY);
    };
    const handleUp = () => {
      if (isDragging) {
        setIsDragging(false);
        const dim = sizeRef.current;
        const snapped = applySnap(positionRef.current, dim);
        const clampedPos = clampToWorkspace(snapped, dim);
        if (clampedPos.x !== positionRef.current.x || clampedPos.y !== positionRef.current.y) {
          setPosition(clampedPos);
        }
        onPositionChange?.(clampedPos);
      }
      if (isResizing) {
        setIsResizing(false);
        const dim = sizeRef.current;
        const pos = clampToWorkspace(positionRef.current, dim);
        if (pos.x !== positionRef.current.x || pos.y !== positionRef.current.y) {
          setPosition(pos);
        }
        onResize?.(dim);
        onPositionChange?.(pos);
      }
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isDragging, isResizing, moveWindow, resizeWindow, onPositionChange, onResize, clampToWorkspace, applySnap]);

  const ws = getWorkspaceSize();
  const mobileOrMaximized = isMobile || isMaximized;

  useEffect(() => {
    if (!isMobile) return;
    setPosition({ x: 0, y: 0 });
    setCurrentSize({ width: ws.width, height: ws.height });
  }, [isMobile, ws.width, ws.height]);

  const layoutSyncKey =
    initialOffset && size
      ? `${initialOffset.x},${initialOffset.y},${size.width},${size.height}`
      : null;

  useEffect(() => {
    if (!layoutSyncKey || !initialOffset || !size || isDragging || isResizing || isMobile || isMaximized) {
      return;
    }
    const ws = getWorkspaceSize();
    const nextSize = {
      width: Math.min(size.width, ws.width),
      height: Math.min(size.height, ws.height),
    };
    setCurrentSize((prev) =>
      prev.width === nextSize.width && prev.height === nextSize.height ? prev : nextSize,
    );
    const pos = clampToWorkspace(initialOffset, nextSize);
    setPosition((prev) => (prev.x === pos.x && prev.y === pos.y ? prev : pos));
  }, [
    layoutSyncKey,
    isDragging,
    isResizing,
    isMobile,
    isMaximized,
    clampToWorkspace,
    getWorkspaceSize,
    initialOffset,
    size,
  ]);

  const clamped = clampToWorkspace(position, currentSize);
  const clampedLeft = mobileOrMaximized ? 0 : clamped.x;
  const clampedTop = mobileOrMaximized ? 0 : clamped.y;

  const startResize = (e: React.MouseEvent, resizeDir: ResizeHandle) => {
    if (mobileOrMaximized) return;
    e.stopPropagation();
    e.preventDefault();
    resizeStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      width: currentSize.width,
      height: currentSize.height,
      left: position.x,
      top: position.y,
      dir: resizeDir,
    };
    setIsResizing(true);
  };

  const shellRef = useRef<HTMLElement>(null);
  const zoomOrigin = dir === "rtl" ? "top right" : "top left";
  const zoomActive = Math.abs(zoom - 1) > 0.001;
  const contentZoomStyle = zoomActive
    ? {
        transform: `scale(${zoom})`,
        transformOrigin: zoomOrigin,
        width: `${100 / zoom}%`,
      }
    : undefined;

  useEffect(() => {
    if (!mobileOrMaximized) return;
    const root = shellRef.current;
    if (!root) return;
    const selector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusable = () =>
      Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((el) => el.offsetParent !== null);
    getFocusable()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = getFocusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    root.addEventListener("keydown", trap);
    return () => root.removeEventListener("keydown", trap);
  }, [mobileOrMaximized]);

  return (
    <section
      data-widget-shell
      ref={shellRef}
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
          ? { zIndex }
          : {
              width: `${currentSize.width}px`,
              height: `${currentSize.height}px`,
              maxWidth: `${ws.width}px`,
              maxHeight: `${ws.height}px`,
              left: `${clampedLeft}px`,
              top: `${clampedTop}px`,
              zIndex,
            }
      }
      dir={dir}
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
        maximizeHiddenOnMobile={maximizeHiddenOnMobile}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onBack={onBack}
        onForward={onForward}
        closeTouchTarget
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
        <div
          className={`custom-scrollbar min-h-0 flex-1 overscroll-y-contain pb-[max(0.75rem,env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch] md:pb-0 ${
            zoomActive ? "overflow-auto" : "overflow-y-auto overflow-x-hidden"
          }`}
        >
          <div
            className={`flex min-h-full w-full flex-col ${zoomActive ? "origin-top" : "h-full min-h-0"}`}
            style={contentZoomStyle}
          >
            {children}
          </div>
        </div>
      </div>

      {!mobileOrMaximized && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onMouseDown={(e) => startResize(e, "n")}
            className="absolute left-3 right-3 top-0 z-[5] h-2 cursor-ns-resize border-0 bg-transparent p-0"
            style={{ cursor: "ns-resize" }}
          />
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onMouseDown={(e) => startResize(e, "s")}
            className="absolute bottom-0 left-3 right-3 z-[5] h-2 cursor-ns-resize border-0 bg-transparent p-0"
            style={{ cursor: "ns-resize" }}
          />
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onMouseDown={(e) => startResize(e, "e")}
            className="absolute right-0 top-10 z-[5] w-2 cursor-ew-resize border-0 bg-transparent p-0"
            style={{ cursor: "ew-resize" }}
          />
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onMouseDown={(e) => startResize(e, "w")}
            className="absolute left-0 top-10 z-[5] w-2 cursor-ew-resize border-0 bg-transparent p-0"
            style={{ cursor: "ew-resize" }}
          />
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onMouseDown={(e) => startResize(e, "nw")}
            className="absolute left-0 top-0 z-[6] h-4 w-4 cursor-nwse-resize border-0 bg-transparent p-0"
            style={{ cursor: "nwse-resize" }}
          />
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onMouseDown={(e) => startResize(e, "ne")}
            className="absolute right-0 top-0 z-[6] h-4 w-4 cursor-nesw-resize border-0 bg-transparent p-0"
          />
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onMouseDown={(e) => startResize(e, "sw")}
            className="absolute bottom-0 left-0 z-[6] h-4 w-4 cursor-nesw-resize border-0 bg-transparent p-0"
          />
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onMouseDown={(e) => startResize(e, "se")}
            className="absolute bottom-0 right-0 z-[6] flex h-7 w-7 cursor-nwse-resize items-end justify-end border-0 bg-transparent p-1.5"
          >
            <div className="workspace-resize-grip" aria-hidden>
              <span />
              <span />
              <span />
            </div>
          </button>
        </>
      )}
    </section>
  );
}
