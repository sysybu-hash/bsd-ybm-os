"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  RESIZE_MIN_WINDOW_HEIGHT,
  RESIZE_MIN_WINDOW_WIDTH,
  isMobileViewport,
  resolveShellDesktopDimensions,
} from "@/lib/workspace/window-layout-policy";

export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const SNAP_THRESHOLD = 24;

/**
 * The workspace size before anything has been measured. Deliberately free of
 * any ref access so it can seed state during the first render; the layout
 * effect below replaces it with the real measurement before the browser
 * paints, so this fallback is never actually visible.
 */
function viewportWorkspaceSize() {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  return { width: Math.max(320, vw - 24), height: Math.max(400, vh - 130) };
}

type DragResizeArgs = {
  initialOffset?: { x: number; y: number };
  size: { width: number; height: number };
  isMaximized: boolean;
  workspaceBoundsRef?: React.RefObject<HTMLElement | null>;
  zoom: number;
  dir: string;
  onPositionChange?: (position: { x: number; y: number }) => void;
  onResize?: (size: { width: number; height: number }) => void;
};

export function useAdaptiveShellDragResize({
  initialOffset,
  size,
  isMaximized,
  workspaceBoundsRef,
  zoom,
  dir,
  onPositionChange,
  onResize,
}: DragResizeArgs) {
  const measureWorkspace = useCallback(() => {
    const el = workspaceBoundsRef?.current;
    if (el) {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) return { width: w, height: h };
    }
    return viewportWorkspaceSize();
  }, [workspaceBoundsRef]);

  /**
   * The measured workspace, mirrored into state.
   *
   * It used to be read straight off `workspaceBoundsRef` during render. That
   * is what `react-hooks/refs` objects to, and the rule was right that it cost
   * something real: when the workspace resized and nothing else changed state,
   * the ref moved and no render followed, so the window went on painting at
   * its previous clamp until some unrelated update happened to arrive.
   *
   * A ResizeObserver on the bounds element is the fix. The setter returns the
   * previous object when the dimensions are identical, so an observer firing
   * on a resize that did not change the box does not cascade a render through
   * every consumer of `ws` — which was the objection to doing this earlier.
   *
   * The initial value still has to come from the element: seeding from the
   * viewport instead and correcting in a layout effect was tried, and it
   * mis-centres the window on the first paint, because `position` is derived
   * from the workspace size once and nothing re-centres it afterwards.
   */
  // A lazy initialiser runs exactly once, on mount, before any commit, so this
  // is not a read during render. The rule cannot tell a lazy initialiser from
  // the render body, which is the whole of its complaint here.
  // eslint-disable-next-line react-hooks/refs
  const [workspaceSize, setWorkspaceSize] = useState(measureWorkspace);

  useLayoutEffect(() => {
    const sync = () =>
      setWorkspaceSize((prev) => {
        const next = measureWorkspace();
        return prev.width === next.width && prev.height === next.height ? prev : next;
      });

    sync();

    const el = workspaceBoundsRef?.current;
    const observer =
      el && typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : undefined;
    observer?.observe(el!);
    window.addEventListener("resize", sync);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [measureWorkspace, workspaceBoundsRef]);

  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && isMobileViewport(),
  );

  const resolveDesktopDimensions = useCallback(
    (ws: { width: number; height: number }) => resolveShellDesktopDimensions(ws, size),
    [size],
  );

  const resizeMinWidth = useCallback(
    (wsWidth: number) =>
      isMobile ? Math.max(280, wsWidth) : Math.min(RESIZE_MIN_WINDOW_WIDTH, Math.max(320, wsWidth - 16)),
    [isMobile],
  );

  const getInitialPosition = useCallback(
    (dim: { width: number; height: number }) => {
      if (isMobile || isMaximized) return { x: 0, y: 0 };
      if (initialOffset) return initialOffset;
      return {
        x: Math.max(0, Math.round(workspaceSize.width / 2 - dim.width / 2)),
        y: Math.max(0, Math.round(workspaceSize.height / 2 - dim.height / 2)),
      };
    },
    [isMobile, isMaximized, initialOffset, workspaceSize],
  );

  const [currentSize, setCurrentSize] = useState(() => {
    if (isMobile || isMaximized) {
      return { width: workspaceSize.width, height: workspaceSize.height };
    }
    return resolveDesktopDimensions(workspaceSize);
  });

  const [position, setPosition] = useState(() => getInitialPosition(currentSize));
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const positionRef = useRef(position);
  const sizeRef = useRef(currentSize);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, x: 0, y: 0 });
  const resizeStartRef = useRef({
    mouseX: 0, mouseY: 0,
    width: size.width, height: size.height,
    left: 0, top: 0,
    dir: "se" as ResizeHandle,
  });
  const shellRef = useRef<HTMLElement>(null);

  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => { sizeRef.current = currentSize; }, [currentSize]);

  useEffect(() => {
    const syncViewport = () => {
      setIsMobile(isMobileViewport());
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
      return {
        x: Math.max(0, Math.min(pos.x, Math.max(0, workspaceSize.width - dim.width))),
        y: Math.max(0, Math.min(pos.y, Math.max(0, workspaceSize.height - dim.height))),
      };
    },
    [workspaceSize],
  );

  const applySnap = useCallback(
    (pos: { x: number; y: number }, dim: { width: number; height: number }) => {
      const ws = workspaceSize;
      return {
        x: pos.x < SNAP_THRESHOLD ? 0
          : pos.x + dim.width > ws.width - SNAP_THRESHOLD ? Math.max(0, ws.width - dim.width)
          : pos.x,
        y: pos.y < SNAP_THRESHOLD ? 0
          : pos.y + dim.height > ws.height - SNAP_THRESHOLD ? Math.max(0, ws.height - dim.height)
          : pos.y,
      };
    },
    [workspaceSize],
  );

  const moveWindow = useCallback(
    (clientX: number, clientY: number) => {
      const { mouseX, mouseY, x, y } = dragStartRef.current;
      setPosition(clampToWorkspace({ x: x + clientX - mouseX, y: y + clientY - mouseY }, sizeRef.current));
    },
    [clampToWorkspace],
  );

  const resizeWindow = useCallback(
    (clientX: number, clientY: number) => {
      const { mouseX, mouseY, width: sw, height: sh, left: sl, top: st, dir: rDir } = resizeStartRef.current;
      const dx = clientX - mouseX;
      const dy = clientY - mouseY;

      let newW = sw, newH = sh, newL = sl, newT = st;

      switch (rDir) {
        case "se": newW = sw + dx; newH = sh + dy; break;
        case "s":  newH = sh + dy; break;
        case "e":  newW = sw + dx; break;
        case "nw": newW = sw - dx; newH = sh - dy; newL = sl + dx; newT = st + dy; break;
        case "n":  newH = sh - dy; newT = st + dy; break;
        case "w":  newW = sw - dx; newL = sl + dx; break;
        case "ne": newW = sw + dx; newH = sh - dy; newT = st + dy; break;
        case "sw": newW = sw - dx; newH = sh + dy; newL = sl + dx; break;
        default: break;
      }

      const ws = workspaceSize;
      newW = Math.max(resizeMinWidth(ws.width), Math.min(newW, ws.width));
      newH = Math.max(RESIZE_MIN_WINDOW_HEIGHT, Math.min(newH, ws.height));

      if (rDir === "nw" || rDir === "w" || rDir === "sw") newL = sl + sw - newW;
      if (rDir === "nw" || rDir === "n" || rDir === "ne") newT = st + sh - newH;

      const clamped = clampToWorkspace({ x: newL, y: newT }, { width: newW, height: newH });
      if (clamped.x !== newL) { newW = Math.max(resizeMinWidth(ws.width), newW - (newL - clamped.x)); newL = clamped.x; }
      if (clamped.y !== newT) { newH = Math.max(RESIZE_MIN_WINDOW_HEIGHT, newH - (newT - clamped.y)); newT = clamped.y; }

      setPosition({ x: newL, y: newT });
      setCurrentSize({ width: newW, height: newH });
    },
    [clampToWorkspace, workspaceSize, resizeMinWidth],
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
        const clamped = clampToWorkspace(snapped, dim);
        if (clamped.x !== positionRef.current.x || clamped.y !== positionRef.current.y) setPosition(clamped);
        onPositionChange?.(clamped);
      }
      if (isResizing) {
        setIsResizing(false);
        const dim = sizeRef.current;
        const pos = clampToWorkspace(positionRef.current, dim);
        if (pos.x !== positionRef.current.x || pos.y !== positionRef.current.y) setPosition(pos);
        onResize?.(dim);
        onPositionChange?.(pos);
      }
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => { window.removeEventListener("mousemove", handleMove); window.removeEventListener("mouseup", handleUp); };
  }, [isDragging, isResizing, moveWindow, resizeWindow, onPositionChange, onResize, clampToWorkspace, applySnap]);

  const ws = workspaceSize;
  const mobileOrMaximized = isMobile || isMaximized;

  /**
   * Both setters return the previous value when nothing changed. That is not
   * only a micro-optimisation: `ws` is state now, so an effect that reads it
   * and sets state unconditionally would be exactly the cascading render
   * `react-hooks/set-state-in-effect` exists to catch.
   */
  useEffect(() => {
    if (!isMobile) return;
    setPosition((prev) => (prev.x === 0 && prev.y === 0 ? prev : { x: 0, y: 0 }));
    setCurrentSize((prev) =>
      prev.width === ws.width && prev.height === ws.height
        ? prev
        : { width: ws.width, height: ws.height },
    );
  }, [isMobile, ws.width, ws.height]);

  const layoutSyncKey =
    initialOffset && size ? `${initialOffset.x},${initialOffset.y},${size.width},${size.height}` : null;

  useEffect(() => {
    if (!layoutSyncKey || !initialOffset || !size || isDragging || isResizing || isMobile || isMaximized) return;
    const nextSize = { width: Math.min(size.width, workspaceSize.width), height: Math.min(size.height, workspaceSize.height) };
    // Same bail-out as above: both setters return `prev` when the layout is
    // already where the props say it should be.
    setCurrentSize((prev) => prev.width === nextSize.width && prev.height === nextSize.height ? prev : nextSize);
    const pos = clampToWorkspace(initialOffset, nextSize);
    setPosition((prev) => prev.x === pos.x && prev.y === pos.y ? prev : pos);
  }, [layoutSyncKey, isDragging, isResizing, isMobile, isMaximized, clampToWorkspace, workspaceSize, initialOffset, size]);

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
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    root.addEventListener("keydown", trap);
    return () => root.removeEventListener("keydown", trap);
  }, [mobileOrMaximized]);

  const clamped = clampToWorkspace(position, currentSize);
  const clampedLeft = mobileOrMaximized ? 0 : clamped.x;
  const clampedTop = mobileOrMaximized ? 0 : clamped.y;

  const startResize = (e: React.MouseEvent, resizeDir: ResizeHandle) => {
    if (mobileOrMaximized) return;
    e.stopPropagation();
    e.preventDefault();
    resizeStartRef.current = {
      mouseX: e.clientX, mouseY: e.clientY,
      width: currentSize.width, height: currentSize.height,
      left: position.x, top: position.y,
      dir: resizeDir,
    };
    setIsResizing(true);
  };

  const zoomOrigin = dir === "rtl" ? "top right" : "top left";
  const zoomActive = Math.abs(zoom - 1) > 0.001;
  const contentZoomStyle = zoomActive
    ? {
        transform: `scale(${zoom})`,
        transformOrigin: zoomOrigin,
        width: `${100 / zoom}%`,
      }
    : undefined;

  return {
    isMobile, mobileOrMaximized,
    currentSize, position,
    isDragging, setIsDragging,
    ws, clamped, clampedLeft, clampedTop,
    shellRef, dragStartRef,
    startResize,
    zoomActive, contentZoomStyle,
  };
}
