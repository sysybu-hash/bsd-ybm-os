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
      className="mx-auto flex min-h-[50vh] max-w-lg flex-col justify-center gap-6 px-6 py-16 text-center"
      dir={dir}
    >
      <h1 className="text-2xl font-black text-slate-900">{t("siteErrors.errorTitle")}</h1>
      <p className="text-sm leading-relaxed text-slate-600">
        {showDetail ? error.message : t("siteErrors.errorBody")}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
        >
          {t("siteErrors.retry")}
        </button>
        <Link
          href="/"
          className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50"
        >
          {t("siteErrors.home")}
        </Link>
        <Link
          href="/login"
          className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50"
        >
          {t("siteErrors.login")}
        </Link>
      </div>
    </div>
  );
}
