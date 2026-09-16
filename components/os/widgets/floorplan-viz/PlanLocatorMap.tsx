"use client";

import React, { useId, useState } from "react";
import type { FloorplanBbox } from "@/lib/projects/floorplan-layout";
import type { LocatorFocus } from "@/lib/projects/floorplan-locator";

type TFn = (key: string, vars?: Record<string, string>) => string;

function PlanCrop({ src, bbox, className }: { src: string; bbox: FloorplanBbox; className?: string }) {
  const widthPct = 100 / Math.max(bbox.w, 0.04);
  const heightPct = 100 / Math.max(bbox.h, 0.04);
  return (
    <div className={`relative overflow-hidden bg-slate-100 ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="absolute max-w-none"
        style={{
          width: `${widthPct}%`,
          height: `${heightPct}%`,
          left: `${(-bbox.x / Math.max(bbox.w, 0.04)) * 100}%`,
          top: `${(-bbox.y / Math.max(bbox.h, 0.04)) * 100}%`,
        }}
      />
    </div>
  );
}

function PlanMinimap({
  src,
  highlight,
  className,
}: {
  src: string;
  highlight: FloorplanBbox | null;
  className?: string;
}) {
  const maskId = useId().replace(/:/g, "");
  const [ratio, setRatio] = useState(1.4);
  return (
    <div className={`flex items-center justify-center bg-slate-900 ${className ?? ""}`}>
      <div className="relative h-full max-w-full" style={{ aspectRatio: String(ratio) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          className="h-full w-full object-fill"
          onLoad={(e) => {
            const el = e.currentTarget;
            if (el.naturalHeight > 0) setRatio(el.naturalWidth / el.naturalHeight);
          }}
        />
        {highlight ? (
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <defs>
              <mask id={maskId}>
                <rect width="100" height="100" fill="white" />
                <rect x={highlight.x * 100} y={highlight.y * 100} width={highlight.w * 100} height={highlight.h * 100} fill="black" />
              </mask>
            </defs>
            <rect width="100" height="100" fill="rgba(15,23,42,0.55)" mask={`url(#${maskId})`} />
            <rect
              x={highlight.x * 100}
              y={highlight.y * 100}
              width={highlight.w * 100}
              height={highlight.h * 100}
              fill="none"
              stroke="#a78bfa"
              strokeWidth="1.4"
            />
          </svg>
        ) : null}
      </div>
    </div>
  );
}

export default function PlanLocatorMap({
  planSrc,
  focus,
  t,
  inset,
}: {
  planSrc: string;
  focus: LocatorFocus;
  t: TFn;
  inset?: boolean;
}) {
  if (inset) {
    return (
      <div className="pointer-events-none w-[7.5rem] overflow-hidden rounded-lg border-2 border-violet-400 shadow-lg">
        <PlanMinimap src={planSrc} highlight={focus.highlight} className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 gap-2 bg-[color:var(--background-main)] px-2 pb-2 pt-1">
      <div className="col-span-3">
        <p className="mb-1 text-[10px] font-bold text-violet-700 dark:text-violet-300">
          {t("workspaceWidgets.floorplanViz.locatorCrop")}
        </p>
        <PlanCrop src={planSrc} bbox={focus.crop} className="h-28 w-full rounded-lg border border-violet-300" />
      </div>
      <div className="col-span-2">
        <p className="mb-1 text-[10px] font-bold text-violet-700 dark:text-violet-300">
          {t("workspaceWidgets.floorplanViz.locatorMap")}
        </p>
        <PlanMinimap src={planSrc} highlight={focus.highlight} className="h-28 w-full rounded-lg border border-violet-300" />
      </div>
    </div>
  );
}
