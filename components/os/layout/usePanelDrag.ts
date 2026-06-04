"use client";

import { useCallback, useRef, useState } from "react";

type Offset = { x: number; y: number };

/**
 * Drag-to-move handler for OS floating panels.
 * Attaches pointer capture to the header element for smooth tracking.
 */
export function usePanelDrag(isMaximized: boolean, draggable: boolean) {
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);

  const reset = useCallback(() => setOffset({ x: 0, y: 0 }), []);

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
    setOffset({ x: d.ox + (e.clientX - d.startX), y: d.oy + (e.clientY - d.startY) });
  }, []);

  const onHeaderPointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* */ }
  }, []);

  return { offset, reset, onHeaderPointerDown, onHeaderPointerMove, onHeaderPointerUp };
}
