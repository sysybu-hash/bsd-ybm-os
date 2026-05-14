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
      className="mx-auto flex min-h-[50vh] max-w-lg flex-col justify-center gap-6 px-6 py-16 text-center"
      dir={dir}
    >
      <p className="text-sm font-bold uppercase tracking-widest text-slate-500">
        {t("siteErrors.notFoundCode")}
      </p>
      <h1 className="text-3xl font-black text-slate-900">{t("siteErrors.notFoundTitle")}</h1>
      <p className="leading-relaxed text-slate-600">{t("siteErrors.notFoundBody")}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
        >
          {t("siteErrors.home")}
        </Link>
        <Link
          href="/app"
          className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50"
        >
          {t("siteErrors.workspace")}
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
