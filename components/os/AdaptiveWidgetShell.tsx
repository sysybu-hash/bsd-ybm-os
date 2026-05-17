import React, { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, X, ZoomIn, ZoomOut } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";

type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface ShellProps {
  id: string;
  title: string;
  onClose: () => void;
  initialOffset?: { x: number; y: number };
  size?: { width: number; height: number };
  zIndex?: number;
  isMaximized?: boolean;
  zoom?: number;
  onFocus?: () => void;
  onPositionChange?: (position: { x: number; y: number }) => void;
  onResize?: (size: { width: number; height: number }) => void;
  onMaximize?: () => void;
  onZoomChange?: (delta: number) => void;
  /** אזור העבודה (מתחת לכותרת, מעל ה־Omnibar) — גבולות גרירה/גודל יחושבו ממנו */
  workspaceBoundsRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}

const MIN_WIDTH = 420;
const MIN_HEIGHT = 320;

export default function AdaptiveWidgetShell({
  id,
  title,
  onClose,
  initialOffset,
  size = { width: 600, height: 450 },
  zIndex = 10,
  isMaximized = false,
  zoom = 1,
  onFocus,
  onPositionChange,
  onResize,
  onMaximize,
  onZoomChange,
  workspaceBoundsRef,
  children,
}: ShellProps) {
  const { t, dir } = useI18n();

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

  const getInitialPosition = () => {
    if (initialOffset) return initialOffset;
    const ws = getWorkspaceSize();
    const width = Math.min(size.width, Math.max(MIN_WIDTH, ws.width - 16));
    const height = Math.min(size.height, Math.max(MIN_HEIGHT, ws.height - 16));
    return {
      x: Math.max(0, ws.width / 2 - width / 2),
      y: Math.max(0, ws.height / 2 - height / 2),
    };
  };

  const [position, setPosition] = useState(getInitialPosition);
  const [currentSize, setCurrentSize] = useState(() => {
    const ws = getWorkspaceSize();
    return {
      width: Math.min(size.width, Math.max(MIN_WIDTH, ws.width - 16)),
      height: Math.min(size.height, Math.max(MIN_HEIGHT, ws.height - 16)),
    };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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
    const syncViewport = () => setIsMobile(window.innerWidth < 768);
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
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

  const moveWindow = useCallback(
    (clientX: number, clientY: number) => {
      const { mouseX, mouseY, x, y } = dragStartRef.current;
      const next = { x: x + clientX - mouseX, y: y + clientY - mouseY };
      setPosition(clampToWorkspace(next, sizeRef.current));
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

      newW = Math.max(MIN_WIDTH, newW);
      newH = Math.max(MIN_HEIGHT, newH);

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
        newW = Math.max(MIN_WIDTH, newW - (newL - clamped.x));
        newL = clamped.x;
      }
      if (clamped.y !== newT) {
        newH = Math.max(MIN_HEIGHT, newH - (newT - clamped.y));
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
        onPositionChange?.(clampToWorkspace(positionRef.current, sizeRef.current));
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
  }, [isDragging, isResizing, moveWindow, resizeWindow, onPositionChange, onResize, clampToWorkspace]);

  const ws = getWorkspaceSize();
  const mobileOrMaximized = isMobile || isMaximized;
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

  const chromeTitle = { title };
  const shellRef = useRef<HTMLElement>(null);
  const zoomOrigin = dir === "rtl" ? "top right" : "top left";
  const contentZoomStyle =
    zoom === 1
      ? undefined
      : {
          transform: `scale(${zoom})`,
          transformOrigin: zoomOrigin,
          width: `${100 / zoom}%`,
          minHeight: `${100 / zoom}%`,
        };

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
      ref={shellRef}
      id={id}
      onMouseDown={onFocus}
      className={`workspace-window pointer-events-auto flex min-h-0 flex-col overflow-hidden transition-[box-shadow,border-color,transform] duration-200 ${
        mobileOrMaximized
          ? "fixed inset-x-0 top-[calc(4rem+env(safe-area-inset-top,0px))] bottom-[var(--mobile-chrome-bottom)] !z-[950] !h-auto !max-h-none !w-full !rounded-none !shadow-none md:absolute md:inset-0 md:!top-0 md:!bottom-0 md:!z-auto md:!h-full md:!max-h-full"
          : "absolute"
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
      <header
        onMouseDown={(e) => {
          if (mobileOrMaximized) return;
          e.preventDefault();
          dragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, x: position.x, y: position.y };
          setIsDragging(true);
        }}
        className={`workspace-window-header flex shrink-0 items-center justify-between gap-2 px-3 py-2.5 ${
          mobileOrMaximized ? "cursor-default pt-[max(0.5rem,env(safe-area-inset-top))]" : "cursor-move"
        }`}
      >
        <div className="min-w-[2rem] flex-1" aria-hidden />

        <h2
          id={`${id}-title`}
          className="max-w-[min(42%,14rem)] truncate rounded-full border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/70 px-3 py-1 text-center text-[11px] font-black tracking-[0.14em] text-[color:var(--foreground-main)] shadow-xs"
        >
          {title}
        </h2>

        <div className="flex flex-1 items-center justify-end gap-1.5">
          <div className="workspace-chrome-toolbar">
            <button
              type="button"
              onClick={() => onZoomChange?.(-0.1)}
              className="workspace-chrome-btn inline-flex"
              aria-label={t("workspaceWidgets.chrome.zoomOutAria", chromeTitle)}
            >
              <ZoomOut size={14} aria-hidden />
            </button>
            <span className="workspace-chrome-zoom inline" aria-live="polite" aria-atomic="true">
              {t("workspaceWidgets.chrome.zoomLevel", { level: String(Math.round(zoom * 100)) })}
            </span>
            <button
              type="button"
              onClick={() => onZoomChange?.(0.1)}
              className="workspace-chrome-btn inline-flex"
              aria-label={t("workspaceWidgets.chrome.zoomInAria", chromeTitle)}
            >
              <ZoomIn size={14} aria-hidden />
            </button>
            <button
              type="button"
              onClick={onMaximize}
              className="workspace-chrome-btn hidden md:inline-flex"
              aria-label={
                isMaximized
                  ? t("workspaceWidgets.chrome.restoreAria", chromeTitle)
                  : t("workspaceWidgets.chrome.maximizeAria", chromeTitle)
              }
            >
              {isMaximized ? <Minimize2 size={15} aria-hidden /> : <Maximize2 size={15} aria-hidden />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="workspace-chrome-btn workspace-chrome-btn--danger inline-flex min-h-11 min-w-11 md:min-h-8 md:min-w-8"
              aria-label={t("workspaceWidgets.chrome.closeAria", chromeTitle)}
            >
              <X size={16} className="shrink-0 md:h-[15px] md:w-[15px]" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <div
        className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-transparent pb-[max(0.75rem,env(safe-area-inset-bottom))] text-[color:var(--foreground-main)] [-webkit-overflow-scrolling:touch] md:pb-0"
      >
        <div className="min-h-full" style={contentZoomStyle}>
          {children}
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
            className="absolute bottom-0 right-0 z-[6] flex h-6 w-6 cursor-nwse-resize items-end justify-end border-0 bg-transparent p-1"
          >
            <div className="pointer-events-none h-3 w-3 border-b-2 border-r-2 border-[color:var(--foreground-muted)] opacity-70" />
          </button>
        </>
      )}
    </section>
  );
}
