"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

type Props = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function AppBuilderError({ error, reset }: Props) {
  useEffect(() => {
    Sentry.captureException(error, {
      extra: { digest: error.digest, route: "app/builder" },
    });
  }, [error]);

  const isDev = process.env.NODE_ENV === "development";

  return (
    <div
      dir="rtl"
      className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-white"
    >
      <div className="flex w-full max-w-sm flex-col gap-5 text-center">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold">שגיאה בפתיחת מחולל האפליקציות</h2>
          <p className="text-sm text-white/50">לא הצלחנו לפתוח את מחולל האפליקציות.</p>
          {isDev && error?.message ? (
            <pre className="mt-2 overflow-auto rounded-xl border border-white/10 bg-white/[0.04] p-3 text-right text-xs text-red-300">
              {error.message}
            </pre>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => reset()}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          נסה שוב
        </button>
      </div>
    </div>
  );
}
