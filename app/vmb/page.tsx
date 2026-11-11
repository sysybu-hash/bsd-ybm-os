import { ArrowLeft } from "lucide-react";
import { VMB_BRAND } from "@/lib/vmb/brand";
import { SITE_CONTACT } from "@/lib/site-contact";
import { vmbT } from "@/lib/vmb/i18n";
import { VmbLink } from "@/components/vmb/VmbLink";
import { VmbWordmark } from "@/components/vmb/VmbWordmark";
import { LandingNav } from "@/components/vmb/landing/LandingNav";
import { SheetRenderSlider } from "@/components/vmb/landing/SheetRenderSlider";
import { AccuracySection, HowSection, StatsStrip, WRAP } from "@/components/vmb/landing/LandingSections";
import { FaqSection, FinalCta, GallerySection, PrivacyPricing, ReadsSection } from "@/components/vmb/landing/LandingMore";

export const dynamic = "force-static";

const HERO_CHIPS = [
  { top: "15%", left: "8%", text: "4.20 m" },
  { top: "44%", left: "30%", text: "6.85 m" },
  { top: "30%", left: "88%", text: "2.80 m" },
];

export default function VmbLandingPage() {
  const t = vmbT("he");
  return (
    <div className="vmb min-h-screen" data-theme="dark" dir="rtl" lang="he">
      <LandingNav
        labels={{
          how: t("vmb.nav.how"),
          accuracy: t("vmb.nav.accuracy"),
          work: t("vmb.gallery.kicker"),
          reads: t("vmb.nav.reads"),
          pricing: t("vmb.nav.pricing"),
          login: t("vmb.nav.login"),
          start: t("vmb.nav.start"),
          menu: t("vmb.nav.menu"),
          byline: t("vmb.brand.byline"),
        }}
      />
      <main>
        <section className="relative h-[100svh] min-h-[660px] overflow-hidden text-white">
          <SheetRenderSlider
            src="/floorplan-viz/styles/luxury.jpg"
            alt={t("vmb.hero.stageRender")}
            sheetLabel={t("vmb.hero.stageSheet")}
            renderLabel={t("vmb.hero.stageRender")}
            chips={HERO_CHIPS}
            priority
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[color:var(--vmb-bg)] via-black/25 to-black/55" />
          <div className={`${WRAP} pointer-events-none absolute inset-x-0 bottom-0 pb-14 sm:pb-20`}>
            <p className="vmb-rise mb-6 flex items-center gap-3 text-sm tracking-wide text-[color:var(--vmb-accent)]">
              <span className="inline-block h-px w-10 bg-[color:var(--vmb-accent)]" />
              {t("vmb.hero.eyebrow")}
            </p>
            <h1
              className="vmb-display vmb-rise max-w-5xl text-[15vw] leading-[.9] font-extrabold sm:text-[8rem]"
              style={{ animationDelay: "100ms" }}
            >
              {t("vmb.hero.title1")}
              <br />
              <span className="font-light text-white/70">{t("vmb.hero.title2")}</span>
            </h1>
            <p className="vmb-rise mt-7 max-w-xl text-base leading-relaxed font-light text-white/75 sm:text-lg" style={{ animationDelay: "200ms" }}>
              {t("vmb.hero.lead")}
            </p>
            <div className="vmb-rise pointer-events-auto mt-9 flex flex-wrap items-center gap-x-8 gap-y-4" style={{ animationDelay: "300ms" }}>
              <VmbLink
                href="/login"
                className="inline-flex items-center gap-3 rounded-full bg-[color:var(--vmb-accent)] px-8 py-4 font-medium text-[color:var(--vmb-accent-ink)] shadow-[0_20px_50px_-15px_var(--vmb-accent)] transition-transform hover:-translate-y-0.5"
              >
                {t("vmb.hero.ctaPrimary")}
                <ArrowLeft className="h-4 w-4 ltr:rotate-180" aria-hidden />
              </VmbLink>
              <span className="hidden text-sm text-white/55 sm:inline">{t("vmb.hero.dragHint")}</span>
            </div>
          </div>
        </section>
        <StatsStrip t={t} />
        <HowSection t={t} />
        <AccuracySection t={t} />
        <div className="h-28 sm:h-40" />
        <GallerySection t={t} />
        <ReadsSection t={t} />
        <PrivacyPricing t={t} />
        <FaqSection t={t} />
        <FinalCta t={t} />
      </main>
      <footer className="border-t border-[color:var(--vmb-line)]">
        <div className={`${WRAP} flex flex-col items-start justify-between gap-6 py-12 sm:flex-row sm:items-center`}>
          <VmbWordmark byline={t("vmb.brand.byline")} className="h-14 w-auto" />
          <nav className="flex flex-wrap gap-8 text-sm text-[color:var(--vmb-muted)]">
            <a href={`mailto:${SITE_CONTACT.email}`} className="hover:text-[color:var(--vmb-ink)]">
              {t("vmb.footer.contact")}
            </a>
            <span>{t("vmb.footer.terms")}</span>
            <span>{t("vmb.footer.privacy")}</span>
          </nav>
          <p className="text-xs text-[color:var(--vmb-muted)]">
            © {new Date().getFullYear()} {VMB_BRAND.parent} · {t("vmb.footer.rights")}
          </p>
        </div>
      </footer>
    </div>
  );
}
