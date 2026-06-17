import Link from "next/link";
import { cookies } from "next/headers";
import { COOKIE_LOCALE, isRtlLocale, normalizeLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/load-messages";
import { createTranslator } from "@/lib/i18n/translate";

export default async function NotFound() {
  const jar = await cookies();
  const locale = normalizeLocale(jar.get(COOKIE_LOCALE)?.value);
  const t = createTranslator(getMessages(locale));
  const dir = isRtlLocale(locale) ? "rtl" : "ltr";

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[color:var(--background-main)] px-6 text-center text-[color:var(--foreground-main)]"
      dir={dir}
      lang={locale}
    >
      <p className="text-6xl font-black text-indigo-500">404</p>
      <h1 className="text-xl font-bold">{t("siteErrors.notFoundTitle")}</h1>
      <p className="max-w-md text-sm text-[color:var(--foreground-muted)]">{t("siteErrors.notFoundBody")}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/workspace"
          className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-500"
        >
          {t("siteErrors.workspace")}
        </Link>
        <Link
          href="/"
          className="rounded-xl border border-[color:var(--border-main)] px-5 py-3 text-sm font-bold hover:bg-[color:var(--surface-soft)]"
        >
          {t("siteErrors.home")}
        </Link>
      </div>
    </div>
  );
}
