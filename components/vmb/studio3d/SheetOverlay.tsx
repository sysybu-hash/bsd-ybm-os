"use client";

import { useState } from "react";
import type { StudioOverlay } from "@/lib/projects/pipeline/flat-studio";

type Mode = "sheet" | "overlay" | "far";

export type OverlayLabels = {
  sheet: string;
  overlay: string;
  far: string;
  close: string;
  near: string;
  away: string;
  /** {median}, {p90} (cm), {close} (%) */
  summary: string;
  none: string;
};

const tone = (m: number, b: StudioOverlay["bounds"]) => (m <= b.close ? "var(--vmb-pass)" : m <= b.far ? "var(--vmb-warn)" : "var(--vmb-fail)");

/**
 * The client's sheet with the model laid on it (live research 5.37): every sampled wall point of the model, coloured
 * by its measured distance to the sheet's ink. "Far" shows only the points beyond the close bound — where to look.
 */
export function SheetOverlay({ src, sheet, overlay, labels }: { src: string; sheet: { width: number; height: number }; overlay: StudioOverlay | null; labels: OverlayLabels }) {
  const [mode, setMode] = useState<Mode>("overlay");
  const shown = !overlay || mode === "sheet" ? [] : mode === "far" ? overlay.points.filter((p) => p[2] > overlay.bounds.close) : overlay.points;
  const r = Math.max(1.4, sheet.width / 700);
  const modes: Array<[Mode, string]> = [
    ["sheet", labels.sheet],
    ["overlay", labels.overlay],
    ["far", labels.far],
  ];
  const cm = (m: number) => (m * 100).toFixed(1);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-full bg-[color:var(--vmb-bg-sunk)] p-1 text-xs" role="tablist">
          {modes.map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1.5 font-semibold ${mode === m ? "bg-[color:var(--vmb-bg-raised)] shadow" : "text-[color:var(--vmb-muted)]"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="vmb-mono text-xs text-[color:var(--vmb-ink-soft)]" dir="rtl">
          {overlay
            ? labels.summary
                .replace("{median}", cm(overlay.all.median))
                .replace("{p90}", cm(overlay.all.p90))
                .replace("{close}", String(Math.round(overlay.all.withinClose * 100)))
            : labels.none}
        </p>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-[color:var(--vmb-line)] bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- an authenticated API image, not a static asset */}
        <img src={src} alt="" width={sheet.width} height={sheet.height} className="block h-auto w-full" style={{ opacity: mode === "sheet" ? 1 : 0.55 }} />
        <svg viewBox={`0 0 ${sheet.width} ${sheet.height}`} className="absolute inset-0 h-full w-full" aria-hidden>
          {overlay ? shown.map(([x, y, m], i) => <circle key={i} cx={x} cy={y} r={mode === "far" ? r * 1.8 : r} fill={tone(m, overlay.bounds)} />) : null}
        </svg>
      </div>
      {overlay ? (
        <div className="flex flex-wrap items-center gap-4 text-xs text-[color:var(--vmb-ink-soft)]">
          {[
            ["var(--vmb-pass)", labels.close],
            ["var(--vmb-warn)", labels.near],
            ["var(--vmb-fail)", labels.away],
          ].map(([c, l]) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full" style={{ background: c }} />
              {l}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
