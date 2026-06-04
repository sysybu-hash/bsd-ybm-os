import type { Metadata } from "next";
import Link from "next/link";
import BrandHomeLink from "@/components/brand/BrandHomeLink";
import { cookies } from "next/headers";
import { COOKIE_LOCALE, normalizeLocale } from "@/lib/i18n/config";
import LocaleSwitcher from "@/components/os/system/LocaleSwitcher";
import { legalSite } from "@/lib/legal-site";
import {
  getGoogleIntegrationDoc,
  GOOGLE_ACCOUNT_PERMISSIONS_URL,
} from "@/lib/google-publish/google-integration-disclosure";
import { getCanonicalSiteUrl } from "@/lib/site-metadata";

export async function generateMetadata(): Promise<Metadata> {
  const base = getCanonicalSiteUrl().replace(/\/$/, "");
  return {
    title: `Google | ${legalSite.siteName}`,
    description:
      "הסבר על התחברות Google, Google Drive ויומן Google ב-BSD-YBM OS — הרשאות, opt-in לסנכרון וביטול גישה.",
    alternates: { canonical: `${base}/integrations/google` },
    robots: { index: true, follow: true },
  };
}

export default async function GoogleIntegrationPage() {
  const jar = await cookies();
  const locale = normalizeLocale(jar.get(COOKIE_LOCALE)?.value);
  const doc = getGoogleIntegrationDoc(locale);
  const dir = locale === "he" ? "rtl" : "ltr";

  return (
    <div className="min-h-dvh bg-[color:var(--background-main)] text-[color:var(--foreground-main)]" dir={dir}>
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4 border-b border-[color:var(--border-main)] px-4 py-4">
        <BrandHomeLink size="sm" />
        <LocaleSwitcher compact />
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-black tracking-tight">{doc.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-[color:var(--foreground-muted)]">{doc.lead}</p>

        <div className="mt-8 space-y-6">
          {doc.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-bold">{section.heading}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[color:var(--foreground-muted)]">{section.body}</p>
            </section>
          ))}
        </div>

        <p className="mt-8">
          <a
            href={GOOGLE_ACCOUNT_PERMISSIONS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-bold text-indigo-500 underline"
          >
            {doc.revokeNote}
          </a>
        </p>

        <nav className="mt-10 flex flex-wrap gap-3 border-t border-[color:var(--border-main)] pt-6 text-sm font-bold">
          <Link href="/privacy" className="text-indigo-500 hover:underline">
            {locale === "en" ? "Privacy Policy" : locale === "ru" ? "Конфиденциальность" : "מדיניות פרטיות"}
          </Link>
          <Link href="/terms" className="text-[color:var(--foreground-muted)] hover:underline">
            {locale === "en" ? "Terms" : locale === "ru" ? "Условия" : "תנאי שימוש"}
          </Link>
          <Link href="/about" className="text-[color:var(--foreground-muted)] hover:underline">
            {locale === "en" ? "About" : locale === "ru" ? "О нас" : "אודות"}
          </Link>
        </nav>
      </main>
    </div>
  );
}
