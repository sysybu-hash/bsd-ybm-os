"use client";

/**
 * Shared chrome for standalone public pages: PublicNavbar + optional hero band +
 * content + MarketingFooter.
 *
 * Tones:
 * - "content" (default): neutral, follows the app theme tokens — for text-heavy
 *   pages styled for light/dark themselves (contact, blog, about, integrations).
 * - "cinematic": wraps children in `.marketing-cinematic`, loading the marketing
 *   CSS so dark-glass sections (PricingSection, IndustriesSection) render as on
 *   the homepage, including the html.light adaptations.
 */
import type { ReactNode } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import PublicNavbar from "@/components/landing/marketing/PublicNavbar";
import MarketingFooter from "@/components/landing/marketing/MarketingFooter";
import "@/components/landing/marketing/marketing-cinematic.css";

type Props = Readonly<{
  tone?: "content" | "cinematic";
  heroTitle?: string;
  heroSubtitle?: string;
  children: ReactNode;
}>;

export default function PublicPageShell({
  tone = "content",
  heroTitle,
  heroSubtitle,
  children,
}: Props) {
  const { dir } = useI18n();

  const hero =
    heroTitle || heroSubtitle ? (
      <div className="border-b border-[color:var(--border-main)] bg-[color:var(--surface-soft)]/50">
        <div className="mx-auto max-w-4xl px-4 py-10 text-center sm:px-6 md:py-14">
          {heroTitle ? (
            <h1 className="text-3xl font-black text-[color:var(--foreground-main)] md:text-4xl">
              {heroTitle}
            </h1>
          ) : null}
          {heroSubtitle ? (
            <p className="mt-3 text-lg text-[color:var(--foreground-muted)]">{heroSubtitle}</p>
          ) : null}
        </div>
      </div>
    ) : null;

  if (tone === "cinematic") {
    return (
      <div dir={dir} className="marketing-cinematic relative min-h-dvh overflow-x-hidden">
        <div className="relative z-10">
          <PublicNavbar />
          <main className="pb-16">{children}</main>
          <MarketingFooter />
        </div>
      </div>
    );
  }

  return (
    <div
      dir={dir}
      className="flex min-h-dvh flex-col bg-[color:var(--background-main)] text-[color:var(--foreground-main)]"
    >
      <PublicNavbar />
      {hero}
      <main className="flex-1">{children}</main>
      <div className="bg-slate-950">
        <MarketingFooter />
      </div>
    </div>
  );
}
