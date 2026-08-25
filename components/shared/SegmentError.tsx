"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/components/os/system/I18nProvider";

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
  title,
  backHref = "/",
  backLabel,
}: SegmentErrorProps) {
  const { t } = useI18n();
  // useI18n degrades to returning the key when no provider is above it, which
  // can happen for a segment that failed before the tree mounted. A user seeing
  // a crash should not also be shown a raw message key.
  const tr = (key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  };
  const heading = title ?? tr("common.errors.segmentTitle", "אירעה שגיאה בטעינת העמוד");
  const back = backLabel ?? tr("common.errors.backHome", "חזרה לדף הבית");

  useEffect(() => {
    Sentry.captureException(error, { extra: { digest: error.digest, route } });
  }, [error, route]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm font-semibold text-[color:var(--foreground-muted)]">{heading}</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-4 py-2 text-sm font-bold text-[color:var(--foreground-main)] transition hover:border-[color:var(--accent)]"
        >
          {tr("common.retry", "נסה שוב")}
        </button>
        <Link
          href={backHref}
          className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-4 py-2 text-sm font-bold text-[color:var(--foreground-muted)] transition hover:text-[color:var(--foreground-main)]"
        >
          {back}
        </Link>
      </div>
    </div>
  );
}
