"use client";

import Link from "next/link";
import { useI18n } from "@/components/os/system/I18nProvider";

type Props = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function RootError({ error, reset }: Props) {
  const { t, dir } = useI18n();
  const showDetail = process.env.NODE_ENV === "development" && Boolean(error?.message);

  return (
    <div
      className="flex min-h-dvh flex-col bg-[color:var(--background-main)] text-[color:var(--foreground-main)]"
      dir={dir}
    >
      <div className="mx-auto flex min-h-[50vh] w-full max-w-lg flex-1 flex-col justify-center gap-6 px-6 py-16 text-center">
        <h1 className="text-2xl font-black text-[color:var(--foreground-main)]">{t("siteErrors.errorTitle")}</h1>
        <p className="text-sm leading-relaxed text-[color:var(--foreground-muted)]">
          {showDetail ? error.message : t("siteErrors.errorBody")}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-indigo-500"
          >
            {t("siteErrors.retry")}
          </button>
          <Link
            href="/"
            className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-5 py-3 text-sm font-bold text-[color:var(--foreground-main)] transition hover:bg-[color:var(--surface-soft)]"
          >
            {t("siteErrors.home")}
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-5 py-3 text-sm font-bold text-[color:var(--foreground-main)] transition hover:bg-[color:var(--surface-soft)]"
          >
            {t("siteErrors.login")}
          </Link>
        </div>
      </div>
    </div>
  );
}
