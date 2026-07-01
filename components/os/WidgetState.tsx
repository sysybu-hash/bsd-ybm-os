"use client";

import React from "react";
import { AlertCircle, Inbox, Loader2 } from "lucide-react";

const centerClass =
  "flex h-full min-h-[200px] flex-col items-center justify-center gap-3 p-6 text-center";

/** אריח-אייקון מעוגל בגוון אקצנט החלון (--win-accent) — חלק משפת התוכן המשותפת. */
const accentTile =
  "flex h-14 w-14 items-center justify-center rounded-2xl text-[color:var(--win-accent,#6366f1)]";
const accentTileStyle: React.CSSProperties = {
  background: "color-mix(in srgb, var(--win-accent, #6366f1) 14%, transparent)",
};

type WidgetStateProps =
  | { variant: "loading"; message?: string }
  | { variant: "error"; message: string; onRetry?: () => void; retryLabel?: string }
  | { variant: "empty"; message: string; action?: React.ReactNode };

export default function WidgetState(props: WidgetStateProps) {
  if (props.variant === "loading") {
    return (
      <div className={centerClass} aria-live="polite" aria-busy="true">
        <div className={accentTile} style={accentTileStyle} aria-hidden>
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
        {props.message ? (
          <p className="text-sm text-[color:var(--foreground-muted)]">{props.message}</p>
        ) : null}
      </div>
    );
  }

  if (props.variant === "error") {
    return (
      <div className={centerClass} role="alert">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/12 text-rose-600 dark:text-rose-400"
          aria-hidden
        >
          <AlertCircle className="h-6 w-6" />
        </div>
        <p className="max-w-sm text-sm text-[color:var(--foreground-main)]">{props.message}</p>
        {props.onRetry ? (
          <button
            type="button"
            onClick={props.onRetry}
            className="rounded-lg bg-[color:var(--win-accent,#6366f1)] px-4 py-2 text-xs font-bold text-white transition hover:opacity-90"
          >
            {props.retryLabel ?? "נסה שוב"}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={centerClass}>
      <div className={accentTile} style={accentTileStyle} aria-hidden>
        <Inbox className="h-6 w-6" />
      </div>
      <p className="max-w-sm text-sm text-[color:var(--foreground-muted)]">{props.message}</p>
      {props.action}
    </div>
  );
}
