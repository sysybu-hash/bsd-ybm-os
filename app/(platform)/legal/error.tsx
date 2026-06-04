"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

type Props = Readonly<{ error: Error & { digest?: string }; reset: () => void }>;

export default function LegalError({ error, reset }: Props) {
  useEffect(() => {
    Sentry.captureException(error, { extra: { digest: error.digest, route: "legal" } });
  }, [error]);
  return (
    <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center bg-[#0a0c10] px-4 py-12 text-white">
      <div className="flex w-full max-w-sm flex-col gap-6 text-center">
        <div className="text-4xl">⚠️</div>
        <h1 className="text-xl font-bold">שגיאה בטעינת העמוד</h1>
        <p className="text-sm text-white/50">לא ניתן לטעון את העמוד המשפטי. נסה שוב.</p>
        {process.env.NODE_ENV === "development" && error?.message && (
          <pre className="overflow-auto rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-red-300">{error.message}</pre>
        )}
        <div className="flex justify-center gap-3">
          <button type="button" onClick={() => reset()} className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold hover:bg-indigo-500">נסה שוב</button>
          <Link href="/" className="rounded-xl border border-white/10 px-5 py-2 text-sm font-bold text-white/80 hover:bg-white/5">עמוד הבית</Link>
        </div>
      </div>
    </div>
  );
}
