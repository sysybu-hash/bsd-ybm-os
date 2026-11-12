"use client";

import { Clock, ScanSearch } from "lucide-react";

export type ProgressLabels = { title: string; stage: string; eta: string; leave: string };

/** The subscriber's live view of a running job: percent, stage, time left. */
export function ProgressCard({ labels, percent }: { labels: ProgressLabels; percent: number }) {
  return (
    <section className="vmb-card p-5" aria-live="polite">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--vmb-accent)] opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[color:var(--vmb-accent)]" />
          </span>
          {labels.title}
        </h2>
        <span className="vmb-mono text-2xl font-semibold">{percent}%</span>
      </div>
      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-[color:var(--vmb-line)]"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={labels.title}
      >
        <div className="vmb-progress-bar h-full rounded-full" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-3 text-sm">{labels.stage}</p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-[color:var(--vmb-muted)]">
        <Clock className="h-3.5 w-3.5" aria-hidden />
        {labels.eta}
      </p>
      <p className="mt-4 border-t border-[color:var(--vmb-line)] pt-3 text-xs text-[color:var(--vmb-muted)]">{labels.leave}</p>
    </section>
  );
}

export type ScanLabels = {
  title: string;
  file: string;
  layers: string;
  blocks: string;
  entities: string;
  ink: string;
  missed: string;
  missed1: string;
  missed2: string;
  rescan: string;
  rescanHint: string;
};

function Meter({ label, read, total }: { label: string; read: number; total: number }) {
  const pct = total > 0 ? Math.round((read / total) * 1000) / 10 : 0;
  const tone = pct >= 99 ? "var(--vmb-pass)" : pct >= 95 ? "var(--vmb-warn)" : "var(--vmb-fail)";
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-[color:var(--vmb-ink-soft)]">{label}</span>
        <span className="vmb-mono">
          {read.toLocaleString("en-US")}/{total.toLocaleString("en-US")}
          <span className="ms-2 font-semibold" style={{ color: tone }}>
            {pct}%
          </span>
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[color:var(--vmb-line)]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tone }} />
      </div>
    </div>
  );
}

/** "How much was scanned" for one file, with what was not read and a second-scan button. */
export function ScanCard({ labels }: { labels: ScanLabels }) {
  return (
    <section className="vmb-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold">{labels.title}</h2>
        <span className="vmb-mono truncate text-xs text-[color:var(--vmb-muted)]">{labels.file}</span>
      </div>
      <div className="mt-4 space-y-3">
        <Meter label={labels.layers} read={38} total={40} />
        <Meter label={labels.blocks} read={212} total={214} />
        <Meter label={labels.entities} read={18406} total={18671} />
        <Meter label={labels.ink} read={972} total={1000} />
      </div>
      <div className="mt-4 rounded-xl bg-[color:var(--vmb-bg-sunk)] p-3">
        <p className="text-xs font-semibold text-[color:var(--vmb-warn)]">{labels.missed}</p>
        <ul className="mt-1.5 space-y-1 text-xs text-[color:var(--vmb-ink-soft)]">
          <li>{labels.missed1}</li>
          <li>{labels.missed2}</li>
        </ul>
      </div>
      <button
        type="button"
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--vmb-accent)] px-4 py-2.5 text-sm font-bold text-[color:var(--vmb-accent)] transition hover:bg-[color:var(--vmb-accent-soft)]"
      >
        <ScanSearch className="h-4 w-4" aria-hidden />
        {labels.rescan}
      </button>
      <p className="mt-1.5 text-center text-[11px] text-[color:var(--vmb-muted)]">{labels.rescanHint}</p>
    </section>
  );
}
