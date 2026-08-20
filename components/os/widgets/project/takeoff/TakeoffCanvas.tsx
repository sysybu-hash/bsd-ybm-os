"use client";

import React from "react";
import { MousePointer2, Loader2 } from "lucide-react";
import type { TakeoffState } from "./useTakeoffState";

type TakeoffCanvasProps = { state: TakeoffState };

/** אזור העבודה — תמונה + שכבות SVG של כיול ומדידה */
export function TakeoffCanvas({ state }: TakeoffCanvasProps) {
  const {
    t,
    imageSrc,
    imageDims,
    isLoading,
    mode,
    scale,
    position,
    isDragging,
    calibrationPoints,
    measurePoints,
    mousePos,
    containerRef,
    svgRef,
    handleMouseDown,
    handleMouseMove,
    endDrag,
    handleWheel,
  } = state;

  // עובי קווים/רדיוס קבוע ויזואלית — מתחלק ב-scale
  const sw = (n: number) => n / scale;

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      className={`relative flex-1 overflow-hidden bg-[color:var(--surface-soft)] ${
        mode === "pan" || isDragging ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"
      }`}
    >
      {!imageSrc ? (
        <div className="flex h-full flex-col items-center justify-center text-[color:var(--foreground-muted)]">
          {isLoading ? (
            <Loader2 className="mb-4 h-12 w-12 animate-spin opacity-60" />
          ) : (
            <MousePointer2 className="mb-4 h-12 w-12 opacity-50" />
          )}
          <p>{t("workspaceWidgets.takeoff.emptyHint")}</p>
        </div>
      ) : (
        <svg
          ref={svgRef}
          className="absolute inset-0 h-full w-full touch-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
        >
          <g transform={`translate(${position.x}, ${position.y}) scale(${scale})`}>
            {imageDims ? (
              <image href={imageSrc} x={0} y={0} width={imageDims.w} height={imageDims.h} />
            ) : null}

            {/* כיול */}
            {calibrationPoints.map((p, i) => (
              <circle key={`cal-${i}`} cx={p.x} cy={p.y} r={sw(4)} fill="#4f46e5" />
            ))}
            {calibrationPoints.length === 1 && mousePos && mode === "calibrate" ? (
              <line
                x1={calibrationPoints[0]!.x}
                y1={calibrationPoints[0]!.y}
                x2={mousePos.x}
                y2={mousePos.y}
                stroke="#4f46e5"
                strokeWidth={sw(2)}
                strokeDasharray={sw(4)}
              />
            ) : null}
            {calibrationPoints.length === 2 ? (
              <line
                x1={calibrationPoints[0]!.x}
                y1={calibrationPoints[0]!.y}
                x2={calibrationPoints[1]!.x}
                y2={calibrationPoints[1]!.y}
                stroke="#4f46e5"
                strokeWidth={sw(3)}
              />
            ) : null}

            {/* פוליגון */}
            {measurePoints.length > 0 ? (
              <polygon
                points={measurePoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="rgba(16, 185, 129, 0.3)"
                stroke="#10b981"
                strokeWidth={sw(2)}
              />
            ) : null}
            {measurePoints.map((p, i) => (
              <circle key={`mes-${i}`} cx={p.x} cy={p.y} r={sw(3)} fill="#10b981" />
            ))}
            {mode === "measure" && measurePoints.length > 0 && mousePos ? (
              <line
                x1={measurePoints[measurePoints.length - 1]!.x}
                y1={measurePoints[measurePoints.length - 1]!.y}
                x2={mousePos.x}
                y2={mousePos.y}
                stroke="#10b981"
                strokeWidth={sw(2)}
                strokeDasharray={sw(4)}
              />
            ) : null}
          </g>
        </svg>
      )}
    </div>
  );
}
