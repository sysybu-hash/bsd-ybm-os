import type { Metadata } from "next";
import { cookies } from "next/headers";
import { COOKIE_LOCALE, normalizeLocale } from "@/lib/i18n/config";
import PublicLegalLayout from "@/components/legal/PublicLegalLayout";
import { buildPublicPageMetadata } from "@/lib/google-publish/public-page-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicPageMetadata("terms");
}
export default async function TermsPage() {
  const jar = await cookies();
  const locale = normalizeLocale(jar.get(COOKIE_LOCALE)?.value);
  return <PublicLegalLayout kind="terms" locale={locale} />;
}
