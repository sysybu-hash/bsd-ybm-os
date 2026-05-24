"use client";

import React from "react";
import type { ResizeHandle } from "./useAdaptiveShellDragResize";

type ResizeHandlesProps = {
  onStartResize: (e: React.MouseEvent, dir: ResizeHandle) => void;
};

export function ResizeHandles({ onStartResize }: ResizeHandlesProps) {
  return (
    <>
      <button
        type="button" aria-hidden tabIndex={-1}
        onMouseDown={(e) => onStartResize(e, "n")}
        className="absolute left-3 right-3 top-0 z-[5] h-2 cursor-ns-resize border-0 bg-transparent p-0"
        style={{ cursor: "ns-resize" }}
      />
      <button
        type="button" aria-hidden tabIndex={-1}
        onMouseDown={(e) => onStartResize(e, "s")}
        className="absolute bottom-0 left-3 right-3 z-[5] h-2 cursor-ns-resize border-0 bg-transparent p-0"
        style={{ cursor: "ns-resize" }}
      />
      <button
        type="button" aria-hidden tabIndex={-1}
        onMouseDown={(e) => onStartResize(e, "e")}
        className="absolute right-0 top-10 z-[5] w-2 cursor-ew-resize border-0 bg-transparent p-0"
        style={{ cursor: "ew-resize" }}
      />
      <button
        type="button" aria-hidden tabIndex={-1}
        onMouseDown={(e) => onStartResize(e, "w")}
        className="absolute left-0 top-10 z-[5] w-2 cursor-ew-resize border-0 bg-transparent p-0"
        style={{ cursor: "ew-resize" }}
      />
      <button
        type="button" aria-hidden tabIndex={-1}
        onMouseDown={(e) => onStartResize(e, "nw")}
        className="absolute left-0 top-0 z-[6] h-4 w-4 cursor-nwse-resize border-0 bg-transparent p-0"
        style={{ cursor: "nwse-resize" }}
      />
      <button
        type="button" aria-hidden tabIndex={-1}
        onMouseDown={(e) => onStartResize(e, "ne")}
        className="absolute right-0 top-0 z-[6] h-4 w-4 cursor-nesw-resize border-0 bg-transparent p-0"
      />
      <button
        type="button" aria-hidden tabIndex={-1}
        onMouseDown={(e) => onStartResize(e, "sw")}
        className="absolute bottom-0 left-0 z-[6] h-4 w-4 cursor-nesw-resize border-0 bg-transparent p-0"
      />
      <button
        type="button" aria-hidden tabIndex={-1}
        onMouseDown={(e) => onStartResize(e, "se")}
        className="absolute bottom-0 right-0 z-[6] flex h-7 w-7 cursor-nwse-resize items-end justify-end border-0 bg-transparent p-1.5"
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
