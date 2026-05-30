"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

type Props = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function AdminError({ error, reset }: Props) {
  useEffect(() => {
    try {
      Sentry.captureException(error, { extra: { digest: error.digest, route: "app/admin" } });
    } catch {
      /* Sentry not configured */
    }
  }, [error]);

  return (
    <div
      dir="rtl"
      className="flex min-h-full flex-col items-center justify-center gap-6 p-8 text-center"
    >
      <h1 className="text-lg font-black text-[color:var(--foreground-main)]">
        שגיאה בממשק הניהול
      </h1>
      <p className="text-sm text-[color:var(--foreground-muted)]">
        {process.env.NODE_ENV === "development" && error?.message
          ? error.message
          : "אירעה שגיאה בלתי צפויה. הצוות קיבל התראה."}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-500"
        >
          נסה שוב
        </button>
        <Link
          href="/app"
          className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-5 py-2.5 text-sm font-bold text-[color:var(--foreground-main)] transition hover:bg-[color:var(--surface-soft)]"
        >
          חזור לדשבורד
        </Link>
      </div>
    </div>
  );
}
