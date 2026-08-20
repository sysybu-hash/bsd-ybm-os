"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import Link from "next/link";

type SegmentErrorProps = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
  /** נתיב לוגי לתיוג ב-Sentry, למשל "/workspace" */
  route: string;
  /** כותרת שגיאה מותאמת; ברירת מחדל כללית */
  title?: string;
  /** יעד כפתור החזרה; ברירת מחדל: הבית */
  backHref?: string;
  backLabel?: string;
}>;

/**
 * Error boundary אחיד ל-route segments — Sentry capture + נסה-שוב + חזרה.
 * עוטפים אותו ב-error.tsx מקומי של כל segment (חייב להיות client component נפרד).
 */
export default function SegmentError({
  error,
  reset,
  route,
  title = "אירעה שגיאה בטעינת העמוד",
  backHref = "/",
  backLabel = "חזרה לדף הבית",
}: SegmentErrorProps) {
  useEffect(() => {
    Sentry.captureException(error, { extra: { digest: error.digest, route } });
  }, [error, route]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm font-semibold text-[color:var(--foreground-muted)]">{title}</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-4 py-2 text-sm font-bold text-[color:var(--foreground-main)] transition hover:border-[color:var(--accent)]"
        >
          נסה שוב
        </button>
        <Link
          href={backHref}
          className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-4 py-2 text-sm font-bold text-[color:var(--foreground-muted)] transition hover:text-[color:var(--foreground-main)]"
        >
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
