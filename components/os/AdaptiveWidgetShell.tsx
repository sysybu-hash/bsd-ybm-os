import React, { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, X, ZoomIn, ZoomOut } from "lucide-react";

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
  children,
}: ShellProps) {
  const getViewportSize = () => ({
    width: typeof window !== "undefined" ? window.innerWidth : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  });

  const getInitialPosition = () => {
    if (initialOffset) return initialOffset;
    const viewport = getViewportSize();
    const width = Math.min(size.width, viewport.width - 32);
    const height = Math.min(size.height, viewport.height - 150);
    return {
      x: Math.max(16, viewport.width / 2 - width / 2),
      y: Math.max(80, viewport.height / 2 - height / 2),
    };
  };

  const [position, setPosition] = useState(getInitialPosition);
  const [currentSize, setCurrentSize] = useState(() => {
    const viewport = getViewportSize();
    return {
      width: Math.min(size.width, viewport.width - 32),
      height: Math.min(size.height, viewport.height - 150),
    };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const positionRef = useRef(position);
  const sizeRef = useRef(currentSize);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, x: 0, y: 0 });
  const resizeStartRef = useRef({ mouseX: 0, mouseY: 0, width: size.width, height: size.height });

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

  const moveWindow = useCallback((clientX: number, clientY: number) => {
    const { mouseX, mouseY, x, y } = dragStartRef.current;
    setPosition({ x: x + clientX - mouseX, y: y + clientY - mouseY });
  }, []);

  const resizeWindow = useCallback((clientX: number, clientY: number) => {
    const { mouseX, mouseY, width, height } = resizeStartRef.current;
    setCurrentSize({
      width: Math.max(MIN_WIDTH, width + clientX - mouseX),
      height: Math.max(MIN_HEIGHT, height + clientY - mouseY),
    });
  }, []);

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMove = (e: MouseEvent) => {
      if (isDragging) moveWindow(e.clientX, e.clientY);
      if (isResizing) resizeWindow(e.clientX, e.clientY);
    };
    const handleUp = () => {
      if (isDragging) {
        setIsDragging(false);
        onPositionChange?.(positionRef.current);
      }
      if (isResizing) {
        setIsResizing(false);
        onResize?.(sizeRef.current);
      }
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isDragging, isResizing, moveWindow, resizeWindow, onPositionChange, onResize]);

  const viewport = getViewportSize();
  const mobileOrMaximized = isMobile || isMaximized;
  const clampedLeft = Math.max(12, Math.min(position.x, viewport.width - currentSize.width - 12));
  const clampedTop = Math.max(76, Math.min(position.y, viewport.height - currentSize.height - 12));

  return (
    <section
      id={id}
      onMouseDown={onFocus}
      className={`workspace-window pointer-events-auto absolute flex flex-col overflow-hidden transition-all duration-200 ${
        mobileOrMaximized ? "inset-0 !h-full !w-full !rounded-none" : ""
      }`}
      style={{
        width: mobileOrMaximized ? "100%" : `${currentSize.width}px`,
        height: mobileOrMaximized ? "100%" : `${currentSize.height}px`,
        maxWidth: mobileOrMaximized ? "100%" : "calc(100vw - 24px)",
        maxHeight: mobileOrMaximized ? "100%" : "calc(100dvh - 130px)",
        left: mobileOrMaximized ? 0 : `${clampedLeft}px`,
        top: mobileOrMaximized ? 0 : `${clampedTop}px`,
        zIndex: mobileOrMaximized ? 2000 : zIndex,
      }}
      dir="rtl"
      aria-label={title}
    >
      <header
        onMouseDown={(e) => {
          if (mobileOrMaximized) return;
          e.preventDefault();
          dragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, x: position.x, y: position.y };
          setIsDragging(true);
        }}
        className={`flex items-center justify-between border-b border-[color:var(--border-main)] bg-[color:var(--surface-soft)] px-3 py-2 ${
          mobileOrMaximized ? "cursor-default" : "cursor-move"
        }`}
      >
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--foreground-muted)] transition hover:bg-rose-500/10 hover:text-rose-600" aria-label={`סגור ${title}`}>
            <X size={15} aria-hidden />
          </button>
          <button type="button" onClick={onMaximize} className="hidden h-8 w-8 items-center justify-center rounded-md text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-card)] hover:text-[color:var(--foreground-main)] md:flex" aria-label={isMaximized ? `הקטן ${title}` : `הגדל ${title}`}>
            {isMaximized ? <Minimize2 size={15} aria-hidden /> : <Maximize2 size={15} aria-hidden />}
          </button>
        </div>

        <h2 className="truncate px-3 text-xs font-black tracking-[0.12em] text-[color:var(--foreground-main)]">{title}</h2>

        <div className="hidden items-center gap-1 md:flex">
          <button type="button" onClick={() => onZoomChange?.(-0.1)} className="flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-card)] hover:text-[color:var(--foreground-main)]" aria-label={`הקטן זום ב-${title}`}>
            <ZoomOut size={14} aria-hidden />
          </button>
          <span className="w-10 text-center text-[10px] font-black text-[color:var(--foreground-muted)]">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => onZoomChange?.(0.1)} className="flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-card)] hover:text-[color:var(--foreground-main)]" aria-label={`הגדל זום ב-${title}`}>
            <ZoomIn size={14} aria-hidden />
          </button>
        </div>
      </header>

      <div className="custom-scrollbar h-full w-full flex-1 overflow-auto bg-transparent pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[color:var(--foreground-main)] md:pb-0" style={{ transform: `scale(${zoom})`, transformOrigin: "top right" }}>
        {children}
      </div>

      {!mobileOrMaximized && (
        <div
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            resizeStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, width: currentSize.width, height: currentSize.height };
            setIsResizing(true);
          }}
          className="absolute bottom-0 right-0 flex h-8 w-8 cursor-nwse-resize items-end justify-end p-1"
          aria-hidden
        >
          <div className="h-3 w-3 border-b-2 border-r-2 border-[color:var(--foreground-muted)]" />
        </div>
      )}
    </section>
  );
}
