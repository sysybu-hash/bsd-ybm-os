"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { VmbLink } from "@/components/vmb/VmbLink";
import { VmbWordmark } from "@/components/vmb/VmbWordmark";
import { VMB_BRAND } from "@/lib/vmb/brand";

type NavLabels = {
  how: string;
  accuracy: string;
  work: string;
  reads: string;
  pricing: string;
  login: string;
  start: string;
  menu: string;
  byline: string;
};

/** Transparent over the hero picture; turns to black glass once the page scrolls. */
export function LandingNav({ labels }: { labels: NavLabels }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { href: "#how", label: labels.how },
    { href: "#accuracy", label: labels.accuracy },
    { href: "#work", label: labels.work },
    { href: "#reads", label: labels.reads },
    { href: "#pricing", label: labels.pricing },
  ];

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 text-white transition-[background,border-color] duration-500 ${
        scrolled || open ? "border-b border-white/10 bg-black/70 backdrop-blur-xl" : "border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-5 sm:px-10">
        <VmbLink href="/" className="shrink-0" aria-label={VMB_BRAND.name}>
          <VmbWordmark byline={labels.byline} />
        </VmbLink>
        <ul className="hidden items-center gap-8 text-sm text-white/75 md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="transition-colors hover:text-white">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="hidden items-center gap-2 md:flex">
          <VmbLink href="/login" className="rounded-full border border-white/25 px-5 py-2 text-sm backdrop-blur-md transition-colors hover:bg-white/10">
            {labels.login}
          </VmbLink>
          <VmbLink
            href="/login"
            className="rounded-full bg-[color:var(--vmb-accent)] px-5 py-2 text-sm font-medium text-[color:var(--vmb-accent-ink)] transition-transform hover:-translate-y-px"
          >
            {labels.start}
          </VmbLink>
        </div>
        <button
          type="button"
          className="rounded-full p-2 md:hidden"
          aria-label={labels.menu}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>
      {open ? (
        <div className="border-t border-white/10 px-5 pb-6 md:hidden">
          <ul className="flex flex-col py-2 text-lg">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="block py-3" onClick={() => setOpen(false)}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <VmbLink
            href="/login"
            className="block rounded-full bg-[color:var(--vmb-accent)] px-4 py-3.5 text-center font-medium text-[color:var(--vmb-accent-ink)]"
          >
            {labels.start}
          </VmbLink>
        </div>
      ) : null}
    </header>
  );
}
