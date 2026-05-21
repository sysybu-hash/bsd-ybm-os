"use client";

/**
 * app/app/error.tsx
 * Error boundary for the workspace (app) route segment.
 * Captures to Sentry and shows a friendly Hebrew recovery UI.
 */
import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

type Props = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function WorkspaceError({ error, reset }: Props) {
  useEffect(() => {
    Sentry.captureException(error, {
      extra: { digest: error.digest, route: "app/*" },
    });
  }, [error]);

  const isDev = process.env.NODE_ENV === "development";

  return (
    <div
      dir="rtl"
      className="flex min-h-screen flex-col items-center justify-center bg-[#0a0c10] px-6 py-16 text-white"
    >
      <div className="flex w-full max-w-md flex-col gap-6 text-center">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.008v.008H12v-.008Z"
              />
            </svg>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-bold">משהו השתבש בסביבת העבודה</h1>
          <p className="text-sm leading-relaxed text-white/50">
            אירעה שגיאה בלתי צפויה. הצוות קיבל התראה אוטומטית.
          </p>
          {isDev && error?.message && (
            <pre className="mt-2 overflow-auto rounded-xl border border-white/10 bg-white/[0.04] p-3 text-right text-xs text-red-300">
              {error.message}
            </pre>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            נסה שוב
          </button>
          <Link
            href="/app"
            className="rounded-xl border border-white/10 bg-white/[0.04] px-6 py-2.5 text-sm font-bold text-white/80 transition hover:bg-white/[0.07]"
          >
            חזור לדשבורד
          </Link>
        </div>
      </div>
    </div>
  );
}
