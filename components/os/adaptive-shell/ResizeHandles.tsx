"use client";

import React from "react";
import type { ResizeHandle } from "./useAdaptiveShellDragResize";

type ResizeHandlesProps = {
  onStartResize: (e: React.MouseEvent, dir: ResizeHandle) => void;
};

/**
 * Edge strips stay thin (~4px) so they do not cover the native/custom scrollbar
 * gutter (~12–17px). Corners keep a larger hit target for easy diagonal resize.
 * Scroll hosts inset from the physical right via AdaptiveWidgetShell.
 */
export function ResizeHandles({ onStartResize }: ResizeHandlesProps) {
  return (
    <>
      {/* top edge — below window chrome so close/minimize stay clickable */}
      <button
        type="button" aria-hidden tabIndex={-1}
        onMouseDown={(e) => onStartResize(e, "n")}
        className="absolute left-5 right-5 top-[var(--window-header-height)] z-[100] h-1 cursor-ns-resize border-0 bg-transparent p-0"
        style={{ cursor: "ns-resize" }}
      />
      {/* bottom edge — thin; avoid stealing horizontal scrollbar / content */}
      <button
        type="button" aria-hidden tabIndex={-1}
        onMouseDown={(e) => onStartResize(e, "s")}
        className="absolute bottom-0 left-5 right-5 z-[100] h-1 cursor-ns-resize border-0 bg-transparent p-0"
        style={{ cursor: "ns-resize" }}
      />
      {/* right edge — 4px only; scrollbar sits inset (see shell-scroll margin) */}
      <button
        type="button" aria-hidden tabIndex={-1}
        onMouseDown={(e) => onStartResize(e, "e")}
        className="absolute bottom-5 right-0 top-[var(--window-header-height)] z-[100] w-1 cursor-ew-resize border-0 bg-transparent p-0"
        style={{ cursor: "ew-resize" }}
      />
      {/* left edge */}
      <button
        type="button" aria-hidden tabIndex={-1}
        onMouseDown={(e) => onStartResize(e, "w")}
        className="absolute bottom-5 left-0 top-[var(--window-header-height)] z-[100] w-1 cursor-ew-resize border-0 bg-transparent p-0"
        style={{ cursor: "ew-resize" }}
      />
      {/* corners — larger grab; primary way to resize width+height */}
      <button
        type="button" aria-hidden tabIndex={-1}
        onMouseDown={(e) => onStartResize(e, "nw")}
        className="absolute left-0 top-[var(--window-header-height)] z-[100] h-4 w-4 cursor-nwse-resize border-0 bg-transparent p-0"
        style={{ cursor: "nwse-resize" }}
      />
      <button
        type="button" aria-hidden tabIndex={-1}
        onMouseDown={(e) => onStartResize(e, "ne")}
        className="absolute right-0 top-[var(--window-header-height)] z-[100] h-4 w-4 cursor-nesw-resize border-0 bg-transparent p-0"
      />
      <button
        type="button" aria-hidden tabIndex={-1}
        onMouseDown={(e) => onStartResize(e, "sw")}
        className="absolute bottom-0 left-0 z-[101] h-4 w-4 cursor-nesw-resize border-0 bg-transparent p-0"
      />
      <button
        type="button" aria-hidden tabIndex={-1}
        onMouseDown={(e) => onStartResize(e, "se")}
        className="absolute bottom-0 right-0 z-[101] flex h-7 w-7 cursor-nwse-resize items-end justify-end border-0 bg-transparent p-1.5"
      >
        <div className="workspace-resize-grip" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      </button>
    </>
  );
}
