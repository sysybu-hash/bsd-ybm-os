"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, Loader2, RotateCcw } from "lucide-react";
import type { ScanView } from "@/lib/vmb/scan-view";

export type ScanLabels = {
  title: string;
  subtitle: string;
  /** {pct} */
  read: string;
  kinds: Record<"layers" | "blocks" | "entities" | "hatches", string>;
  /** {n} */
  unreadTitle: string;
  allRead: string;
  reasons: Record<string, string>;
  /** Each takes {n}. */
  holds: Record<"lines" | "hatches" | "texts" | "arcs" | "blocks", string>;
  scanning: string;
  waiting: string;
  rescan: string;
  showMore: string;
  showLess: string;
  /** {n} */
  notScannedYet: string;
  empty: string;
  errors: Record<string, string>;
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
/** 12,390 → 12.4k, so four counts fit side by side on a phone. */
const compact = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString("en-US"));
const tone = (share: number) => (share >= 0.95 ? "var(--vmb-pass)" : share >= 0.8 ? "var(--vmb-warn)" : "var(--vmb-fail)");
const fill = (t: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), t);

export type RowState = { status: "waiting" | "scanning" | "failed"; error?: string } | null;

/** One file's scan: the read share, the counts by kind, and the list of what was left out. */
export function ScanFileRow({ name, scan, state, labels, onRescan }: { name: string; scan: ScanView | null; state: RowState; labels: ScanLabels; onRescan: () => void }) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const busy = state?.status === "scanning" || state?.status === "waiting";
  const unread = scan ? (all ? scan.unread : scan.unread.slice(0, 6)) : [];

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <span className="vmb-mono min-w-0 flex-1 truncate text-xs" dir="ltr" style={{ unicodeBidi: "plaintext", textAlign: "right" }} title={name}>
          {name}
        </span>
        {busy ? (
          <span className="flex items-center gap-1.5 text-xs text-[color:var(--vmb-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
            {state.status === "scanning" ? labels.scanning : labels.waiting}
          </span>
        ) : state?.status === "failed" ? (
          <span className="flex items-center gap-1.5 text-xs text-[color:var(--vmb-fail)]">
            {labels.errors[state.error ?? "generic"] ?? labels.errors.generic}
            <button type="button" onClick={onRescan} aria-label={labels.rescan} className="rounded-full p-1 hover:bg-[color:var(--vmb-bg-sunk)]">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </span>
        ) : scan?.share != null ? (
          <span className="vmb-mono text-sm font-bold" style={{ color: tone(scan.share) }}>
            {fill(labels.read, { pct: pct(scan.share) })}
          </span>
        ) : null}
      </div>

      {scan && !busy ? (
        <>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--vmb-line)]">
            <span className="block h-full rounded-full" style={{ width: pct(scan.share ?? 0), background: tone(scan.share ?? 0) }} />
          </div>
          <dl className="mt-2.5 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
            {(Object.keys(labels.kinds) as Array<keyof ScanLabels["kinds"]>).map((k) => (
              <div key={k} className="flex items-baseline justify-between gap-2">
                <dt className="text-[color:var(--vmb-muted)]">{labels.kinds[k]}</dt>
                <dd className="vmb-mono whitespace-nowrap" dir="ltr" title={`${scan.counts[k].read.toLocaleString("en-US")}/${scan.counts[k].total.toLocaleString("en-US")}`}>
                  {compact(scan.counts[k].read)}/{compact(scan.counts[k].total)}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-2 flex items-center justify-between">
            {scan.unread.length ? (
              <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-1.5 text-xs font-semibold text-[color:var(--vmb-warn)]">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                {fill(labels.unreadTitle, { n: scan.unread.length })}
                <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} aria-hidden />
              </button>
            ) : (
              <span className="text-xs text-[color:var(--vmb-pass)]">{labels.allRead}</span>
            )}
            <button type="button" onClick={onRescan} className="flex items-center gap-1 text-[11px] text-[color:var(--vmb-muted)] hover:text-[color:var(--vmb-ink)]">
              <RotateCcw className="h-3 w-3" aria-hidden />
              {labels.rescan}
            </button>
          </div>
          {open && scan.unread.length ? (
            <ul className="mt-2 space-y-1.5 rounded-xl bg-[color:var(--vmb-bg-sunk)] p-3 text-xs">
              {unread.map((u) => (
                <li key={`${u.reason}:${u.name}`} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="vmb-mono font-semibold" dir="ltr">
                    {u.name}
                  </span>
                  <span className="vmb-mono text-[color:var(--vmb-muted)]">×{u.count.toLocaleString("en-US")}</span>
                  <span className="text-[color:var(--vmb-ink-soft)]">· {labels.reasons[u.reason] ?? labels.reasons.other}</span>
                  {u.holds ? (
                    <span className="text-[color:var(--vmb-muted)]">
                      (
                      {(Object.keys(labels.holds) as Array<keyof ScanLabels["holds"]>)
                        .filter((k) => (u.holds?.[k] ?? 0) > 0)
                        .map((k) => fill(labels.holds[k], { n: u.holds![k] }))
                        .join(", ")}
                      )
                    </span>
                  ) : null}
                </li>
              ))}
              {scan.unread.length > 6 ? (
                <li>
                  <button type="button" onClick={() => setAll((a) => !a)} className="text-[color:var(--vmb-accent)]">
                    {all ? labels.showLess : labels.showMore}
                  </button>
                </li>
              ) : null}
            </ul>
          ) : null}
        </>
      ) : null}
    </li>
  );
}
