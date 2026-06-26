"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import Link from "next/link";

export default function MobileDashError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, { extra: { digest: error.digest, route: "/m/dashboard" } });
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm font-semibold text-[color:var(--foreground-muted)]">
        שגיאה בטעינת הדשבורד
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-4 py-2 text-sm font-bold text-[color:var(--foreground-main)] transition hover:border-[color:var(--accent)]"
        >
          נסה שוב
        </button>
        <Link
          href="/workspace"
          className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-4 py-2 text-sm font-bold text-[color:var(--foreground-muted)] transition hover:text-[color:var(--foreground-main)]"
        >
          חזור ל-OS
        </Link>
      </div>
    </div>
  );
}
