"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { VmbLink } from "@/components/vmb/VmbLink";
import { vmbT } from "@/lib/vmb/i18n";

const t = vmbT("he");

/** Shared error boundary body for VMB route segments; reports to Sentry with the route. */
export function VmbErrorView({ error, reset, route }: { error: Error & { digest?: string }; reset: () => void; route: string }) {
  useEffect(() => {
    Sentry.captureException(error, { extra: { digest: error.digest, route } });
  }, [error, route]);

  return (
    <div className="vmb flex min-h-screen items-center justify-center px-4" data-theme="dark" dir="rtl" lang="he">
      <div className="vmb-card max-w-md p-8 text-center">
        <h1 className="vmb-display text-2xl font-extrabold">{t("vmb.errors.title")}</h1>
        <p className="mt-3 text-sm text-[color:var(--vmb-ink-soft)]">{t("vmb.errors.body")}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-full bg-[color:var(--vmb-accent)] px-6 py-2.5 text-sm font-bold text-[color:var(--vmb-accent-ink)]"
          >
            {t("vmb.errors.retry")}
          </button>
          <VmbLink href="/app" className="rounded-full border border-[color:var(--vmb-line)] px-6 py-2.5 text-sm font-bold">
            {t("vmb.errors.home")}
          </VmbLink>
        </div>
      </div>
    </div>
  );
}
