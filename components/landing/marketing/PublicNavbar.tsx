"use client";

/**
 * Link-based navbar for standalone public pages (/pricing, /contact, /blog, /about…).
 * Unlike MarketingNavbar it has no panel-sheet context — plain <Link> navigation,
 * so it works on any page under the (platform) layout.
 */
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import BrandHomeLink from "@/components/brand/BrandHomeLink";
import LocaleSwitcher from "@/components/os/system/LocaleSwitcher";
import ThemeToggle from "@/components/os/system/ThemeToggle";
import { useI18n } from "@/components/os/system/I18nProvider";

const NAV_LINKS: ReadonlyArray<{ href: string; labelKey: string }> = [
  { href: "/pricing", labelKey: "marketingHome.nav.pricing" },
  { href: "/solutions", labelKey: "marketingHome.nav.solutions" },
  { href: "/blog", labelKey: "marketingHome.editorial.nav.blog" },
  { href: "/contact", labelKey: "marketingHome.nav.contact" },
  { href: "/about", labelKey: "marketingHome.nav.about" },
];

export default function PublicNavbar() {
  const { t, dir } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const linkCls = (href: string) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return `rounded-lg px-3 py-1.5 text-sm font-bold transition ${
      active
        ? "bg-[color:var(--surface-soft)] text-[color:var(--foreground-main)]"
        : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--foreground-main)]"
    }`;
  };

  return (
    <header
      dir={dir}
      className="sticky top-0 z-40 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/85 backdrop-blur"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <BrandHomeLink size="sm" variant="image" tone="auto" loading="eager" />
          <nav className="hidden items-center gap-0.5 lg:flex" aria-label={t("marketingHome.nav.product")}>
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={linkCls(l.href)}>
                {t(l.labelKey)}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <LocaleSwitcher compact className="hidden sm:block" />
          <div className="hidden sm:block">
            <ThemeToggle variant="landing" />
          </div>
          <Link
            href="/login"
            className="hidden rounded-full border border-[color:var(--border-main)] px-4 py-1.5 text-sm font-bold text-[color:var(--foreground-main)] transition hover:bg-[color:var(--surface-soft)] sm:inline-flex"
          >
            {t("marketingHome.osLanding.signIn")}
          </Link>
          <Link
            href="/login?mode=register"
            className="inline-flex rounded-full bg-[color:var(--brand-accent,#4f46e5)] px-4 py-1.5 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
          >
            {t("marketingHome.hero.ctaRegister")}
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={t("marketingHome.cinematic.menuAria")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--foreground-main)] transition hover:bg-[color:var(--surface-soft)] lg:hidden"
          >
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      {open ? (
        <nav
          aria-label={t("marketingHome.nav.product")}
          className="border-t border-[color:var(--border-main)] bg-[color:var(--background-main)] px-4 pb-4 pt-2 lg:hidden"
        >
          <ul className="flex flex-col gap-1">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={`block ${linkCls(l.href)}`}
                >
                  {t(l.labelKey)}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-2 sm:hidden">
            <LocaleSwitcher compact />
            <ThemeToggle variant="landing" />
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="ms-auto rounded-full border border-[color:var(--border-main)] px-4 py-1.5 text-sm font-bold"
            >
              {t("marketingHome.osLanding.signIn")}
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
