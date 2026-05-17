"use client";

import React from "react";
import { AlertCircle, Inbox, Loader2 } from "lucide-react";

const centerClass =
  "flex h-full min-h-[200px] flex-col items-center justify-center gap-3 p-6";

type WidgetStateProps =
  | { variant: "loading"; message?: string }
  | { variant: "error"; message: string; onRetry?: () => void; retryLabel?: string }
  | { variant: "empty"; message: string; action?: React.ReactNode };

export default function WidgetState(props: WidgetStateProps) {
  if (props.variant === "loading") {
    return (
      <div className={centerClass} aria-live="polite" aria-busy="true">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" aria-hidden />
        {props.message ? <p className="text-sm text-[color:var(--foreground-muted)]">{props.message}</p> : null}
      </div>
    );
  }

  if (props.variant === "error") {
    return (
      <div className={centerClass} role="alert">
        <AlertCircle className="h-8 w-8 text-rose-500" aria-hidden />
        <p className="max-w-sm text-center text-sm text-[color:var(--foreground-main)]">{props.message}</p>
        {props.onRetry ? (
          <button
            type="button"
            onClick={props.onRetry}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500"
          >
            {props.retryLabel ?? "נסה שוב"}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={centerClass}>
      <Inbox className="h-8 w-8 text-[color:var(--foreground-muted)]" aria-hidden />
      <p className="max-w-sm text-center text-sm text-[color:var(--foreground-muted)]">{props.message}</p>
      {props.action}
    </div>
  );
}
