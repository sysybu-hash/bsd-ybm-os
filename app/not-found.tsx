"use client";

import Link from "next/link";
import { useI18n } from "@/components/os/system/I18nProvider";

export default function NotFound() {
  const { t, dir } = useI18n();

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[color:var(--background-main)] px-6 text-center text-[color:var(--foreground-main)]"
      dir={dir}
    >
      <p className="text-6xl font-black text-indigo-500">404</p>
      <h1 className="text-xl font-bold">{t("siteErrors.notFoundTitle")}</h1>
      <p className="max-w-md text-sm text-[color:var(--foreground-muted)]">{t("siteErrors.notFoundBody")}</p>
      <Link
        href="/"
        className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-500"
      >
        {t("siteErrors.home")}
      </Link>
    </div>
  );
}
