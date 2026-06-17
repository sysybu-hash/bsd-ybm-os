"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  RESIZE_MIN_WINDOW_HEIGHT,
  RESIZE_MIN_WINDOW_WIDTH,
  isMobileViewport,
  resolveShellDesktopDimensions,
} from "@/lib/workspace/window-layout-policy";

export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const SNAP_THRESHOLD = 24;

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
  const getWorkspaceSize = useCallback(() => {
    const el = workspaceBoundsRef?.current;
    if (el) {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) return { width: w, height: h };
    }
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    return { width: Math.max(320, vw - 24), height: Math.max(400, vh - 130) };
  }, [workspaceBoundsRef]);

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
      const ws = getWorkspaceSize();
      return {
        x: Math.max(0, Math.round(ws.width / 2 - dim.width / 2)),
        y: Math.max(0, Math.round(ws.height / 2 - dim.height / 2)),
      };
    },
    [isMobile, isMaximized, initialOffset, getWorkspaceSize],
  );

  const [currentSize, setCurrentSize] = useState(() => {
    const ws = getWorkspaceSize();
    if (isMobile || isMaximized) return { width: ws.width, height: ws.height };
    return resolveDesktopDimensions(ws);
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
      const ws = getWorkspaceSize();
      return {
        x: Math.max(0, Math.min(pos.x, Math.max(0, ws.width - dim.width))),
        y: Math.max(0, Math.min(pos.y, Math.max(0, ws.height - dim.height))),
      };
    },
    [getWorkspaceSize],
  );

  const applySnap = useCallback(
    (pos: { x: number; y: number }, dim: { width: number; height: number }) => {
      const ws = getWorkspaceSize();
      return {
        x: pos.x < SNAP_THRESHOLD ? 0
          : pos.x + dim.width > ws.width - SNAP_THRESHOLD ? Math.max(0, ws.width - dim.width)
          : pos.x,
        y: pos.y < SNAP_THRESHOLD ? 0
          : pos.y + dim.height > ws.height - SNAP_THRESHOLD ? Math.max(0, ws.height - dim.height)
          : pos.y,
      };
    },
    [getWorkspaceSize],
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

      const ws = getWorkspaceSize();
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
    [clampToWorkspace, getWorkspaceSize, resizeMinWidth],
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

  const ws = getWorkspaceSize();
  const mobileOrMaximized = isMobile || isMaximized;

  useEffect(() => {
    if (!isMobile) return;
    setPosition({ x: 0, y: 0 });
    setCurrentSize({ width: ws.width, height: ws.height });
  }, [isMobile, ws.width, ws.height]);

  const layoutSyncKey =
    initialOffset && size ? `${initialOffset.x},${initialOffset.y},${size.width},${size.height}` : null;

  useEffect(() => {
    if (!layoutSyncKey || !initialOffset || !size || isDragging || isResizing || isMobile || isMaximized) return;
    const wsInner = getWorkspaceSize();
    const nextSize = { width: Math.min(size.width, wsInner.width), height: Math.min(size.height, wsInner.height) };
    setCurrentSize((prev) => prev.width === nextSize.width && prev.height === nextSize.height ? prev : nextSize);
    const pos = clampToWorkspace(initialOffset, nextSize);
    setPosition((prev) => prev.x === pos.x && prev.y === pos.y ? prev : pos);
  }, [layoutSyncKey, isDragging, isResizing, isMobile, isMaximized, clampToWorkspace, getWorkspaceSize, initialOffset, size]);

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
