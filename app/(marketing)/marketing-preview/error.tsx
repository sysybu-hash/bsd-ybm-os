"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";

type Props = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function MarketingPreviewError({ error, reset }: Props) {
  const { t, dir } = useI18n();

  useEffect(() => {
    Sentry.captureException(error, {
      extra: { digest: error.digest, route: "/marketing-preview" },
    });
  }, [error]);

  return (
    <div className="marketing-cinematic flex min-h-dvh items-center justify-center px-4" dir={dir}>
      <div className="mkt-glass max-w-md rounded-3xl p-8 text-center">
        <h1 className="text-xl font-bold text-white">{t("siteErrors.errorTitle")}</h1>
        <p className="mt-3 text-sm text-slate-300">{t("siteErrors.errorBody")}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button type="button" onClick={() => reset()} className="rounded-2xl mkt-btn-primary px-5 py-3 font-bold">
            {t("siteErrors.retry")}
          </button>
          <Link href="/" className="rounded-2xl mkt-btn-ghost px-5 py-3 text-sm font-bold">
            {t("marketingHome.cinematic.backToHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}
