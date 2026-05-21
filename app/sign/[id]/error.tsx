"use client";

/**
 * app/sign/[id]/error.tsx
 * Error boundary for the public document-signing page.
 */
import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

type Props = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function SignError({ error, reset }: Props) {
  useEffect(() => {
    Sentry.captureException(error, {
      extra: { digest: error.digest, route: "sign/[id]" },
    });
  }, [error]);

  const isDev = process.env.NODE_ENV === "development";

  return (
    <div
      dir="rtl"
      className="flex min-h-screen flex-col items-center justify-center bg-[#0a0c10] px-4 py-12 text-white"
    >
      <div className="flex w-full max-w-md flex-col gap-6 text-center">
        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-7 w-7"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-bold">לא ניתן לטעון את המסמך</h1>
          <p className="text-sm leading-relaxed text-white/50">
            אירעה שגיאה בטעינת המסמך לחתימה. ייתכן שהקישור אינו תקף או שפג תוקפו.
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
            href="/"
            className="rounded-xl border border-white/10 bg-white/[0.04] px-6 py-2.5 text-sm font-bold text-white/80 transition hover:bg-white/[0.07]"
          >
            עמוד הבית
          </Link>
        </div>
      </div>
    </div>
  );
}
