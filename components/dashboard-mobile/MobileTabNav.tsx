"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Grid3x3 } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { CLASSIC_MOBILE_PRIMARY } from "@/lib/classic/sections";

type NavItem = {
  href: string;
  labelKey: string;
  icon: React.ElementType;
  fab?: boolean;
};

const ITEMS: ReadonlyArray<NavItem> = [
  ...CLASSIC_MOBILE_PRIMARY.map((s) => ({
    href: s.mobileHref,
    labelKey: s.labelKey,
    icon: s.icon,
    fab: s.fab,
  })),
  { href: "/m/dashboard/more", labelKey: "workspaceWidgets.mobileNav.moreApps", icon: Grid3x3 },
];

export default function MobileTabNav() {
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("workspaceWidgets.mobileNav.aria")}
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-[color:var(--classic-rule)] bg-[color:var(--glass-bg)]"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-end justify-around px-1 pt-1">
        {ITEMS.map(({ href, labelKey, icon: Icon, fab }) => {
          const active = pathname.startsWith(href);
          if (fab) {
            return (
              <Link
                key={href}
                href={href}
                aria-label={t(labelKey)}
                aria-current={active ? "page" : undefined}
                className="flex flex-col items-center gap-1 pb-0.5"
              >
                <span
                  className={`-mt-5 flex h-14 w-14 items-center justify-center rounded-full border-4 border-[color:var(--background-main)] text-white shadow-md transition active:scale-95 ${
                    active
                      ? "bg-[color:var(--classic-accent)]"
                      : "bg-[color:var(--classic-accent)] opacity-90"
                  }`}
                >
                  <Icon size={24} strokeWidth={1.75} aria-hidden />
                </span>
                <span
                  className={`text-[10px] font-bold leading-tight ${
                    active ? "text-[color:var(--classic-accent)]" : "text-[color:var(--classic-muted)]"
                  }`}
                >
                  {t(labelKey)}
                </span>
              </Link>
            );
          }
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 transition active:scale-95 ${
                active
                  ? "text-[color:var(--classic-accent)]"
                  : "text-[color:var(--classic-muted)] hover:text-[color:var(--classic-ink)]"
              }`}
            >
              {active ? (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--classic-accent-soft)]">
                  <Icon size={18} strokeWidth={2} aria-hidden />
                </span>
              ) : (
                <Icon size={22} strokeWidth={1.75} aria-hidden />
              )}
              <span className="text-[10px] font-bold leading-tight">{t(labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
