"use client";

import { useState } from "react";

type Mode = "sheet" | "model" | "overlay";

export type OverlayLabels = {
  title: string;
  sheet: string;
  model: string;
  overlay: string;
  close: string;
  near: string;
  far: string;
};

/** Wall segments of the sample plan, each with its measured distance to the sheet ink (m). */
const WALLS: Array<{ d: string; dev: number }> = [
  { d: "M80 60 H520", dev: 0.03 },
  { d: "M520 60 V300", dev: 0.02 },
  { d: "M520 300 H330", dev: 0.05 },
  { d: "M330 300 V440", dev: 0.22 },
  { d: "M330 440 H80", dev: 0.04 },
  { d: "M80 440 V60", dev: 0.03 },
  { d: "M290 60 V230 H80", dev: 0.06 },
  { d: "M380 300 V170 H520", dev: 0.41 },
];

function tone(dev: number): string {
  if (dev <= 0.15) return "var(--vmb-pass)";
  if (dev <= 0.35) return "var(--vmb-warn)";
  return "var(--vmb-fail)";
}

export function OverlayViewer({ labels }: { labels: OverlayLabels }) {
  const [mode, setMode] = useState<Mode>("overlay");
  const showSheet = mode !== "model";
  const showModel = mode !== "sheet";
  const modes: Array<[Mode, string]> = [
    ["sheet", labels.sheet],
    ["model", labels.model],
    ["overlay", labels.overlay],
  ];
  return (
    <section className="vmb-card flex min-h-[420px] flex-col overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--vmb-line)] px-4 py-3">
        <h2 className="text-sm font-bold">{labels.title}</h2>
        <div className="flex rounded-full bg-[color:var(--vmb-bg-sunk)] p-1 text-xs" role="tablist">
          {modes.map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1.5 font-semibold transition ${
                mode === m ? "bg-[color:var(--vmb-bg-raised)] text-[color:var(--vmb-ink)] shadow" : "text-[color:var(--vmb-muted)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <div className="vmb-grid relative flex-1">
        <svg viewBox="0 0 600 500" className="absolute inset-0 h-full w-full" aria-hidden>
          {showSheet ? (
            <g fill="none" stroke="var(--vmb-ink)" strokeOpacity={mode === "overlay" ? 0.35 : 0.85} strokeLinecap="square">
              <path d="M80 60 H520 V300 H330 V440 H80 Z" strokeWidth="9" />
              <path d="M290 60 V230 H80 M380 300 V170 H520" strokeWidth="4" />
              <path d="M290 230 a50 50 0 0 1 -50 -50 M380 230 a40 40 0 0 0 40 40" strokeWidth="1.2" />
            </g>
          ) : null}
          {showModel ? (
            <g fill="none" strokeWidth="3.2" strokeLinecap="round" transform={mode === "overlay" ? "translate(1.5 1)" : undefined}>
              {WALLS.map((w, i) => (
                <path key={i} d={w.d} stroke={mode === "overlay" ? tone(w.dev) : "var(--vmb-measure)"} />
              ))}
            </g>
          ) : null}
          {mode === "overlay" ? (
            <g className="vmb-mono" fontSize="12" fill="var(--vmb-fail)">
              <circle cx="380" cy="235" r="16" fill="none" stroke="var(--vmb-fail)" strokeDasharray="3 3" />
              <text x="402" y="232">0.41 m</text>
            </g>
          ) : null}
        </svg>
      </div>
      <footer className="flex flex-wrap items-center gap-4 border-t border-[color:var(--vmb-line)] px-4 py-2.5 text-xs text-[color:var(--vmb-ink-soft)]">
        {[
          ["var(--vmb-pass)", labels.close],
          ["var(--vmb-warn)", labels.near],
          ["var(--vmb-fail)", labels.far],
        ].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-full" style={{ background: c }} />
            {l}
          </span>
        ))}
      </footer>
    </section>
  );
}
