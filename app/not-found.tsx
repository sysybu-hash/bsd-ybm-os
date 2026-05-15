import Link from "next/link";
import { cookies } from "next/headers";
import {
  COOKIE_LOCALE,
  normalizeLocale,
  isRtlLocale,
  type AppLocale,
} from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/load-messages";
import { createTranslator } from "@/lib/i18n/translate";

export default async function NotFound() {
  const jar = await cookies();
  const locale = normalizeLocale(jar.get(COOKIE_LOCALE)?.value) as AppLocale;
  const messages = getMessages(locale);
  const t = createTranslator(messages);
  const dir = isRtlLocale(locale) ? "rtl" : "ltr";

  return (
    <div
      className="flex min-h-dvh flex-col bg-[color:var(--background-main)] text-[color:var(--foreground-main)]"
      dir={dir}
    >
      <div className="mx-auto flex min-h-[50vh] w-full max-w-lg flex-1 flex-col justify-center gap-6 px-6 py-16 text-center">
        <p className="text-sm font-bold uppercase tracking-widest text-[color:var(--foreground-muted)]">
          {t("siteErrors.notFoundCode")}
        </p>
        <h1 className="text-3xl font-black text-[color:var(--foreground-main)]">{t("siteErrors.notFoundTitle")}</h1>
        <p className="leading-relaxed text-[color:var(--foreground-muted)]">{t("siteErrors.notFoundBody")}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-indigo-500"
          >
            {t("siteErrors.home")}
          </Link>
          <Link
            href="/app"
            className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-5 py-3 text-sm font-bold text-[color:var(--foreground-main)] transition hover:bg-[color:var(--surface-soft)]"
          >
            {t("siteErrors.workspace")}
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
