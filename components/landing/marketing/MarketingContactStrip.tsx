"use client";

import { Clock, Mail, MapPin, MessageCircle } from "lucide-react";
import ScrollReveal from "@/components/landing/marketing/ScrollReveal";
import {
  SITE_CONTACT,
  siteContactAddress,
  siteContactAvailability,
  siteContactPhoneDisplay,
  siteContactWhatsAppUrl,
} from "@/lib/site-contact";
import { useI18n } from "@/components/os/system/I18nProvider";

type Props = Readonly<{ embedded?: boolean; inPanel?: boolean }>;

export default function MarketingContactStrip({ embedded = false, inPanel = false }: Props) {
  const { t, locale } = useI18n();
  const Root = embedded ? "div" : "section";

  return (
    <Root id={embedded ? undefined : "contact"} className={embedded ? "" : "scroll-mt-24 px-4 py-8 sm:px-6"} aria-labelledby="mkt-contact-strip-heading">
      <div className="mx-auto max-w-4xl">
        <ScrollReveal>
          <div className="mkt-glass rounded-3xl p-5 sm:p-6">
            {!inPanel ? (
              <h2 id="mkt-contact-strip-heading" className="mb-4 text-center text-lg font-black text-white">
                {t("marketingHome.contact.stripTitle")}
              </h2>
            ) : null}
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400/90" aria-hidden />
                <span>
                  <span className="block font-bold text-white">{t("marketingHome.contact.phoneLabel")}</span>
                  <a
                    href={siteContactWhatsAppUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-100 underline-offset-2 hover:underline"
                  >
                    {siteContactPhoneDisplay(locale)}
                    <span className="sr-only"> — {t("marketingHome.contact.whatsappAria")}</span>
                  </a>
                </span>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-amber-400/90" aria-hidden />
                <span>
                  <span className="block font-bold text-white">{t("marketingHome.contact.emailLabel")}</span>
                  <a
                    href={`mailto:${SITE_CONTACT.email}`}
                    className="break-all text-amber-100 underline-offset-2 hover:underline"
                  >
                    {SITE_CONTACT.email}
                  </a>
                </span>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-amber-400/90" aria-hidden />
                <span>
                  <span className="block font-bold text-white">{t("marketingHome.contact.addressLabel")}</span>
                  {siteContactAddress(locale)}
                </span>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-400/90" aria-hidden />
                <span>
                  <span className="block font-bold text-white">{t("marketingHome.contact.hoursLabel")}</span>
                  {siteContactAvailability(locale)}
                </span>
              </li>
            </ul>
          </div>
        </ScrollReveal>
      </div>
    </Root>
  );
}
