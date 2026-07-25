"use client";

/**
 * Per-screen title bar for the mobile classic dashboard.
 *
 * MobileDashLayout's own <header> shows one generic, unchanging title
 * ("workspaceWidgets.classicDashboard.title") on every tab — CRM, scanner, AI,
 * settings all look the same at the top, so there's no visual confirmation of
 * which section is open. This renders directly under that header, inside the
 * scrollable <main>, so it does not duplicate the back-to-OS arrow or clock
 * and does not touch the single-scroller layout in globals.css.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";

type MobileScreenHeaderProps = {
  title: string;
  icon?: LucideIcon;
  /** Route back to the mobile "more" grid (or omit for a primary bottom-nav tab). */
  backHref?: string;
  action?: React.ReactNode;
};

export function MobileScreenHeader({ title, icon: Icon, backHref, action }: MobileScreenHeaderProps) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 border-b border-[color:var(--classic-rule)] px-4 py-3">
      {backHref ? (
        <Link
          href={backHref}
          aria-label={t("workspaceWidgets.mobileNav.back")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[color:var(--classic-muted)] transition hover:bg-[color:var(--surface-soft)] active:scale-95"
        >
          <ArrowRight size={16} className="rtl:rotate-0 ltr:rotate-180" aria-hidden />
        </Link>
      ) : null}
      {Icon ? <Icon size={18} className="shrink-0 text-[color:var(--classic-accent)]" aria-hidden /> : null}
      <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-[color:var(--classic-ink)]">{title}</h2>
      {action}
    </div>
  );
}
