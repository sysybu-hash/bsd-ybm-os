"use client";

import Link from "next/link";
import BrandHomeLink from "@/components/brand/BrandHomeLink";
import { useI18n } from "@/components/os/system/I18nProvider";

export default function MarketingFooter() {
  const { t } = useI18n();
  const year = String(new Date().getFullYear());

  return (
    <footer className="border-t border-white/10 px-4 py-12 pb-28 sm:px-6 md:pb-12">
      <div className="mx-auto max-w-7xl">
        {/* 4-column grid: brand×2 | legal | nav — ממלא את כל הרשת ב-desktop */}
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
          <div className="md:col-span-2">
            <BrandHomeLink size="sm" variant="image" tone="night" />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">{t("marketingHome.footer.lead")}</p>
          </div>

          <div>
            <h3 className="text-sm font-bold text-white">{t("marketingHome.editorial.footerLegalTitle")}</h3>
            <ul className="mt-4 space-y-2 text-sm text-slate-400">
              <li>
                <Link href="/about" className="transition-colors hover:text-white">
                  {t("marketingHome.osLanding.footerAbout")}
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="transition-colors hover:text-white">
                  {t("marketingHome.osLanding.footerPrivacy")}
                </Link>
              </li>
              <li>
                <Link href="/terms" className="transition-colors hover:text-white">
                  {t("marketingHome.osLanding.footerTerms")}
                </Link>
              </li>
              <li>
                <Link href="/legal" className="transition-colors hover:text-white">
                  {t("marketingHome.osLanding.footerCookies")}
                </Link>
              </li>
            </ul>
          </div>

          {/* עמודת ניווט מהיר — ממלא את העמודה הרביעית הריקה */}
          <div>
            <h3 className="text-sm font-bold text-white">{t("marketingHome.footer.navTitle")}</h3>
            <ul className="mt-4 space-y-2 text-sm text-slate-400">
              <li>
                <Link href="/#explore" className="transition-colors hover:text-white">
                  {t("marketingHome.nav.product")}
                </Link>
              </li>
              <li>
                <Link href="/#live-demo" className="transition-colors hover:text-white">
                  {t("marketingHome.nav.workflows")}
                </Link>
              </li>
              <li>
                <Link href="/blog" className="transition-colors hover:text-white">
                  {t("marketingHome.editorial.nav.blog")}
                </Link>
              </li>
              <li>
                <Link href="/contact" className="transition-colors hover:text-white">
                  {t("marketingHome.editorial.nav.contact")}
                </Link>
              </li>
              <li>
                <Link href="/login" className="transition-colors hover:text-white">
                  {t("marketingHome.osLanding.signIn")}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <p className="mt-10 border-t border-white/10 pt-6 text-center text-xs text-slate-400">
          {t("marketingHome.osLanding.footerCopyright", { year })}
        </p>
      </div>
    </footer>
  );
}
