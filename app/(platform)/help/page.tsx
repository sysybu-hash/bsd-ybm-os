import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import HelpCenterWidget from "@/components/os/widgets/HelpCenterWidget";
import { COOKIE_LOCALE, isRtlLocale, normalizeLocale } from "@/lib/i18n/config";
import { buildPublicPageMetadata } from "@/lib/google-publish/public-page-metadata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPublicPageMetadata("help");

const BACK_LABEL: Record<string, string> = {
  he: "← חזרה למרחב העבודה",
  en: "← Back to workspace",
  ru: "← Назад к рабочему столу",
};

// HelpCenterWidget's content (guides, FAQ) is entirely static/generic — no
// account-specific data — and this page is declared public in sitemap.ts and
// buildPublicPageMetadata("help") (index:true). It must stay reachable by
// anonymous visitors and search crawlers, not gated behind login.
export default async function HelpPage() {
  const locale = normalizeLocale((await cookies()).get(COOKIE_LOCALE)?.value);
  const dir = isRtlLocale(locale) ? "rtl" : "ltr";

  return (
    <div className="min-h-screen bg-[color:var(--background-main)]" dir={dir}>
      <div className="mx-auto max-w-5xl p-4">
        <Link href="/" className="mb-4 inline-block text-sm font-bold text-blue-600 hover:underline">
          {BACK_LABEL[locale] ?? BACK_LABEL.he}
        </Link>
        <div className="h-[calc(100vh-6rem)] h-[calc(100dvh-6rem)] overflow-hidden rounded-2xl border border-[color:var(--border-main)] shadow-lg">
          <HelpCenterWidget />
        </div>
      </div>
    </div>
  );
}
